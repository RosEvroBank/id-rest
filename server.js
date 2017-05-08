var express = require('express');
var http = require("http");
var https = require("https");
var idContract = require("./contract/id.js");
var services = require("./contract/services.js");
var params = require("./contract/config.json");
var fs = require("fs");
var crypto = require("crypto");
var jwt = require('jsonwebtoken');
var accountconfig = require("./accountconfig/accountconfig.json");

var flat = require('node-flat-db');
var storage = require('node-flat-db/file-sync');
var db = flat('./db/db.json', { storage: storage });
var events = flat('events.json', { storage: storage});
var uuid = require("uuid");

/**
 * REST Server configuration.
 */
var port = params.port || 8080;
var https_port = params.https_port || 443;
var use_https = params.enable_https;

if (use_https){
/**
 * Configure ssl keys
 */
var privateKeyFile = params.private_key_file;
var certificateFile = params.certificate_file;

//console.log(privateKeyFile);
//console.log(certificateFile);
var privateKey  = fs.readFileSync(privateKeyFile, 'utf8');
var certificate = fs.readFileSync(certificateFile, 'utf8');
var credentials = {key: privateKey, cert: certificate};
}

var helmet = require('helmet');

// Create a new Express application.
var app = express();


app.use(require('body-parser').urlencoded({ extended: true }));

//Security
app.use(helmet());
app.disable('x-powered-by');


function createToken(user){
  return jwt.sign({login: user.login}, accountconfig.secret, { expiresIn: accountconfig.expiresIn });
}

//Authentication
app.post('/auth', function (req, res) {
  var login = req.body.login;
  var password = req.body.password;
  var auth = false;
  console.log(req.body.login);  
  if (req.body.login) {
    if( login != void 0 && password != void 0 )
    {
      console.log("auth");
      var user = db('users').find({login: login});
      if (user){        
        auth = user.pwd == password;
        if (auth){
          res.status(201).send({ token: createToken(user) });          
        } else {
            res.status(500).json({error: "Invalid <password>."});    
        }
      } else {
        res.status(500).json({error: "User with login <"+ login +"> not found."});
      }
    } else {
      res.status(500).json({error: "Parameters <login> or <password> not found."});
    }
  }    
});

function loadUser(req, res, next) {
   console.log('loadUser');
   
   var token = null;
   if (req.method === "POST"){
     token = req.body.token;
   } else {
     if (req.method === "GET"){
       token = req.query.token;
     }
   }
   
   if (token) {
     var login = jwt.verify(token, accountconfig.secret);
     console.log(login);
     if (login) {
       var user = db('users').find({login: login.login});
       console.log(user);
       if (user) {
         console.log(user);
         next();
       } else {
          res.status(200).json({result: null, error:'Please login!'});
       }
     } else {
        res.status(200).json({result: null, error:'Please login!'});
     }
   } else {
     res.status(200).json({result: null, error:'Parameter <token> not found.'});
   }
}  

app.get('/test', loadUser, 
function(req, res){ 
  console.log("test");  
  console.log(crypto.createHash('sha256').update("test").digest('hex'));
  res.setHeader('Content-Type', 'text/html');
    res.write('<p>login success </p>');
    res.end();
});

app.post('/test', loadUser, function(req, res){
  console.log("test");
  res.setHeader('Content-Type', 'text/html');
    res.write('<p>login success </p>');
    res.end();
});


//Is transaction in block
app.get('/waitTx', loadUser,
  function(req, res){

    services.waitTx(req.query.txHash)
    .then(function(result){
      res.status(200).json({result:result, error: null});
    })
    .catch(function(error){
      res.status(500).json({result: null, error: error.message});
    });
});

//Get participants list
app.get('/id/getParticipantsList', //loadUser,
  function(req, res){
    console.log('/id/getParticipantsList');
    var participants = idContract.List().valueOf();        
    var participantsJSON = [];
    for (i = 0; i < participants.length; i++){
      if (participants[i]){
        var participant = idContract.GetParticipant(participants[i]).valueOf();
        var participantJSON = {id: participant[0], name: participant[1], url: participant[3], uri: participant[4]};        
        participantsJSON.push(participantJSON);
      }        
  } 
  res.status(200).json(participantsJSON);
});

//Get Token Hash from event
app.get('/id/getToken', loadUser,
  function(req, res){
    console.log('/id/getEvent');
    if (req.query.txHash){
      var event = events('events').find({event: 'eTokenGiven', transactionHash: req.query.txHash});      
      res.status(200).json({token: event.args._token});
    } else{
      res.status(500).json({error: 'Parameter <txHash> not found'});
    }
});

//Get address of administartion contract
app.get('/id/address', loadUser, 
  function(req, res){    
    console.log('address/id');
    idContract.address()
    .then(function(result){
      res.status(200).json({result:result, error:null});
    })
    .catch(function(error){
      res.status(500).json({ result: null, error: error.message});
    });
});

//Participant REST API
//Add customer
app.post('/id/AddCustomerHash', loadUser,
  function(req, res){
    console.log("/id/AddCustomerHash params:")
    console.log(req.body.hashtoken);
    console.log(req.body.hash);
    idContract.AddHash(req.body.hashtoken, req.body.hash, {gas: params.gas})
    .then(function(result){
      res.status(200).json({result:result, error:null});
    })
    .catch(function(error){
      res.status(500).json({ result: null, error: error.message});
    }); 
  });


//Give token permission  
app.post('/id/GiveTokenPerm', loadUser,
  function(req, res){
    console.log("/id/GiveTokenPerm params:")
    console.log(req.body.address);
    console.log(req.body.hashtoken);
    idContract.GiveTokenPerm(req.body.address, req.body.hashtoken, {gas: params.gas})
    .then(function(result){
      res.status(200).json({result:result, error:null});
    })
    .catch(function(error){
      res.status(500).json({ result: null, error: error.message});
    }); 
  });  

//Request by call function 
app.get('/id/RequestC', loadUser,
  function(req, res){
    console.log("/id/RequestC params:")
    console.log(req.query.hashtoken);
    console.log(req.query.hash);
    idContract.RequestC(req.query.hashtoken, req.query.hash, {gas: params.gas})
    .then(function(result){
      res.status(200).json({result:result, error:null});
    })
    .catch(function(error){
      res.status(500).json({ result: null, error: error.message});
    }); 
  });

//Request with transaction sending  
app.get('/id/Request', loadUser,
  function(req, res){
    console.log("/id/Request params:")
    console.log(req.query.hashtoken);
    console.log(req.query.hash);
    idContract.Request(req.query.hash, req.query.token, {gas: params.gas})
    .then(function(result){
      res.status(200).json({result:result, error:null});
    })
    .catch(function(error){
      res.status(500).json({ result: null, error: error.message});
    }); 
  });

//Request with permission control
app.get('/id/RequestP', loadUser,
  function(req, res){
    console.log("/id/RequestP params:")
    console.log(req.query.hashtoken);
    console.log(req.query.hash);
    idContract.RequestP(req.query.hash, req.query.token, {gas: params.gas})
    .then(function(result){
      res.status(200).json({result:result, error:null});
    })
    .catch(function(error){
      res.status(500).json({ result: null, error: error.message});
    }); 
  });
  
app.get('/teapot',
  function(req,res){
    res.sendStatus(418);
  });

if (use_https){
  var httpsServer = https.createServer(credentials, app);
  httpsServer.listen(https_port, function(){
	console.log('HTTPS server listening on port ' + https_port );
  });
} else {
  var server = http.createServer(app);
  server.listen(port, function () {
  console.log('HTTP server listening on port ' + port);
  });  
}