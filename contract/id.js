/*!
 * identification
 * Copyright(c) 2017 RosEvroBank, Anatoliy A Aksenov, Ayrat R Yakubov
 * MIT Licensed
 */

'use strict';

var q = require('q');
var params = require("./config.json");
var accountconfig = require("../accountconfig/accountconfig.json");
var flat = require('node-flat-db');
var storage = require('node-flat-db/file-sync');
var db = flat('events.json', { storage: storage });

/**
 * Module exports
 * @public
 */
(function (root, factory) {
	if (typeof exports === "object") {
		// CommonJS
        module.exports = exports = factory();
	}
	else if (typeof define === "function" && define.amd) {
		// AMD
		define([], factory);
	}
	else {
		// Global (browser)
		root.id = factory();
	}
}(this, function () {
    /**
	 * Identify common components.
     * @private
	 */
    var Common = (function(){
        /**
         * Function for print debug information when debugging enabled.
         * 
         * @param {string} Message for print
         * 
         */
        function debug(str){
          if(/ID|Id|id/g.test(params.debug)){
                    console.log(str);
          }
        }
        debug('Start common initialization');
        
        /**
         * Initial Web3 
         * @private
         */
        var web3 = {};
        try {
            var Web3 = require('web3');
            web3 = new Web3();
            debug('web3 loaded');
        } catch (e) {
            throw new Error("Module 'web3' required. Call 'npm install web3' before...");
        }

        /**
         * Ethereum geth RPC server address
         * @private
         */
        var rpc_url;
        if (accountconfig.rpc_url == void 0){
            throw new Error("Environment variable 'RPC_URL' required. Call 'set RPC_URL=http://localhost:8545/' before...");
        }        
        rpc_url = accountconfig.rpc_url;
        debug(`rpc_url: ${rpc_url}`);
        /**
         * Ethereum IDChain contract account
         * @private
         */
        var id_address;
        if (params.id_contract_address == void 0){
            throw new Error("Environment variable 'ID_CONTRACT_ADDRESS' required. Call 'set ID_CONTRACT_ADDRESS=0x<ethereum contract account>' before...");
        }
        id_address = params.id_contract_address;
        debug(`id_address: ${id_address}`);
        
        /**
         * Ethereum admin contract account
         * @private
         */
        var admin_address;
        if (params.admin_contract_address == void 0){
            throw new Error("Environment variable 'ADMIN_CONTRACT_ADDRESS' required. Call 'set ADMIN_CONTRACT_ADDRESS=0x<ethereum contract account>' before...");
        }
        admin_address = params.admin_contract_address;
        debug(`admin_address: ${admin_address}`);
        /**
         * Initial web3
         */
        var rpc_provider = new web3.providers.HttpProvider(rpc_url);
        try{
            web3.setProvider(rpc_provider);
        } catch (e){
            throw new Error("Error set RPC provider into Web3. Check 'RPC_URL' and 'CONTRACT_ADDRESS' environment variables correct and RPC server online.\n" + e);
        }

        if(!web3.isConnected())
        {
            throw new Error("Can't connect using '"+ rpc_url + "' to Ethereum geth RPC Server.");
        }
        debug('Web3 configured and eabled.');

        /**
         * Set default account for call smart-contract functions which use setTransaction
         */
        if((web3.eth.accounts.length == 0 || web3.eth.accounts.length > 1) && (accountconfig.accountId == void 0))
        {
            //throw new Error("Can't get current account for call smart-contract functions. Call 'set DEFAULT_CONTRACT' before...");
        }        
        web3.eth.defaultAccount = accountconfig.accountId || web3.eth.accounts[0];
        debug(`Default account: ${web3.eth.defaultAccount}`);

        /**
         * ABI for Ethereum smart-contract
         * @public
         */
        var id_abi = require('./idAbi.js');
        var admin_abi = require('./admAbi.js')
        debug(`ABI enabled.`);
        return {
            /**
             * Ethereum IDchain smart-contract interface.
             */
            id_abi: id_abi,
            /**
             * Ethereum Admin smart-contract interface.
             */
            admin_abi: admin_abi,
            /**
             * Ethereum IDCHain smart-contract object.
             */
            idContract: web3.eth.contract(id_abi).at(id_address),
            /**
             * Ethereum Admin smart-contract object.
             */
            admContract: web3.eth.contract(admin_abi).at(admin_address),
            /**
             * Default user account 
             */
            defaultAccount: web3.eth.defaultAccount,
            /**
             * Debug function. For use call 'set DEBUG=identify' or run application 'DEBUG=identify node server.js'
             * 
             * @param {string} Message for print
             * 
             * @example common.debug('Debug message');
             */
            debug: debug,                       
        }            
        
    })();
    
    /**
	 * Identify base components.
     * @public
	 */
    var id = id || (function(common){
        common.debug(`Starting identification module.`);        
        
        var idEvent = common.idContract.allEvents({}, {fromBlock: 0, toBlock: 'latest'});
        //fromBlock: 0, toBlock: 'latest'
		common.debug("event create");
		idEvent.watch(function(err, result) {
		    if (err) {
		        common.debug(err);
                common.debug("eventerror");
		        return;
		    }
		    common.debug("event");
            common.debug(result);
            db('events').push(result);            
        });

        return {
            address: function() {
                var deferred = q.defer();
                if (!common.idContract){
                    common.debug('Smart-contract not currently enable');
                    deferred.reject(new Error('Smart-contract not currently enable'));
                    return deferred.promise;
                }
                deferred.resolve(common.idContract.address);
                
                return deferred.promise;
            },
            /**
             * User administration. Get participants list.
             * 
			 * @return {string[]} array of addresses.
             * 
             * @example Administration.List()
             *          .then(function(txHash){
             *              console.log(txHash);
             *          })
             *          .catch(function(error){
             *              console.log("%j", error);
             *          });
             */
            List: function(){
                var deferred = q.defer();

                    common.debug('function=<List>');
                    if(!common.admContract){
                        common.debug('Smart-contract not currently enabled.');
                        deferred.reject(new Error('Smart-contract not currently enabled.'));
                        return deferred.promise;
                    }
                    //TODO: Include calling waitTx function for return only entered transactions.
                    //When we fire smart-contract function using sendTransaction we receive a transaction
                    //hash and us need to wait when transaction was enteren in then latest block of blockchain
                    var result = common.admContract.DonorsList.call();
                    common.debug(`List result=<${result}>`);
                    deferred.resolve(result);
                                        
                return deferred.promise;
            },
            /**
             * User administration. Get participant.
             * 
             * @param {string} user ethereum address
             * 
             * @return {string} name
             * 
             * @return {uint8} role.
             *
             * @return {string} url
             * 
             * @return {string} uri
             *  
             * @example Administration.GetRole( '0x4108f8299DCC126c56F0df02825F700e854b5b32' )
             *          .then(function(txHash){
             *              console.log(txHash);
             *          })
             *          .catch(function(error){
             *              console.log("%j", error);
             *          });
             */
            GetParticipant: function(address){
                var deferred = q.defer();

                    common.debug('function=<GetParticipant> address=<' + address + '>');
                    if(!common.admContract){
                        common.debug('Smart-contract not currently enabled.');
                        deferred.reject(new Error('Smart-contract not currently enabled.'));
                        return deferred.promise;
                    }                    
                    var result = common.admContract.GetParticipant.call(address);
                    common.debug(`GetParticipant result=<${result}>`);
                    deferred.resolve(result);
                                        
                return deferred.promise;
            },
            /**
             * Adding hash.
             * 
             * @param {string} token
             * 
             * @param {string} hash
             * 
             * @return {string} tx number.
             * 
             * @example Identify.AddHash('c3053184574070770f574018a6681e549f6b92a658528ad8f14d6a66c2f9a72ba99e64175d4cc920b8be66a66c2d66756f523c2b3cd6ee3534d0fd67b96c65cd', 'd44d94fcfa245c9c6cc5c53ccda79341ba8d44a1b6e5920021fbe0dd9dfcae666653e45d5780db90521fa0114ad41de35565f6e723de292a951004eceeb89e90')
             *          .then(function(txHash){
             *              console.log(txHash);
             *          })
             *          .catch(function(error){
             *              console.log("%j", error);
             *          });
             */
            AddHash: function(token, hash){
                var deferred = q.defer();

                common.debug(`function=<AddHash> token=<${token}> hash=<${hash}>`);     

                if(!common.idContract){
                    common.debug('Smart-contract not currently enabled.');
                    deferred.reject(new Error('Smart-contract not currently enabled.'));
                    return deferred.promise;
                }           
              
                common.idContract.addCustomerHash.sendTransaction(token, hash, function(err, res){
                    if(err){
                        common.debug(`AddHash result error: ${err}`);
                        deferred.reject(new Error(err));
                    } else {
                        common.debug(`AddHash result ${res}`);
                        deferred.resolve(res);
                    }
                });

                return deferred.promise;
            },
            /**
             * Giving tocken permissions.
             * 
             * @param {string} user ethereum address
             * 
             * @param {string} token string.
             * 
             * @return {string} tx number.
             * 
             * @example Identify.GiveTokenPerm( '0x4108f8299DCC126c56F0df02825F700e854b5b32', 'c3053184574070770f574018a6681e549f6b92a658528ad8f14d6a66c2f9a72ba99e64175d4cc920b8be66a66c2d66756f523c2b3cd6ee3534d0fd67b96c65cd')
             *          .then(function(txHash){
             *              console.log(txHash);
             *          })
             *          .catch(function(error){
             *              console.log("%j", error);
             *          });
             */            
            GiveTokenPerm: function(address, token){
                var deferred = q.defer();

                common.debug('function=<GiveTokenPerm> address=<' + address + '> token=<' + token + '>');
                if(!common.idContract){
                    common.debug('Smart-contract not currently enabled.');
                    deferred.reject(new Error('Smart-contract not currently enabled.'));
                    return deferred.promise;
                }
                common.idContract.GiveTokenPerm.sendTransaction(address, token, function(err, res){
                    if(err){
                        common.debug(`GiveTokenPerm result error: ${err}`);
                        deferred.reject(new Error(err));
                    } else {
                        common.debug(`GiveTokenPerm result ${res}`);
                        deferred.resolve(res);
                    }
                });
                    
                return deferred.promise;
            },
            /**
             * Request P.
             * 
             * @param {string} token
             * 
             * @param {string} hash
             * 
             * @return {string} tx number.
             * 
             * @example Identify.RequestP('c3053184574070770f574018a6681e549f6b92a658528ad8f14d6a66c2f9a72ba99e64175d4cc920b8be66a66c2d66756f523c2b3cd6ee3534d0fd67b96c65cd', 'd44d94fcfa245c9c6cc5c53ccda79341ba8d44a1b6e5920021fbe0dd9dfcae666653e45d5780db90521fa0114ad41de35565f6e723de292a951004eceeb89e90');
             *          .then(function(result){
             *              console.log("%j", result);
             *          })
             *          .catch(function(error){
             *              console.log("%j", error);
             *          });
             */
            RequestP: function(token, hash){
                var deferred = q.defer();

                common.debug(`function=<RequestP> token=<${token}> hash=<${hash}>`);     

                if(!common.idContract){
                    common.debug('Smart-contract not currently enabled.');
                    deferred.reject(new Error('Smart-contract not currently enabled.'));
                    return deferred.promise;
                }           
               common.idContract.RequestP.sendTransaction(token, hash, function(err, res){
                    if(err){
                        common.debug(`RequestP result error: ${err}`);
                        deferred.reject(new Error(err));
                    } else {
                        common.debug(`RequestP result ${res}`);
                        deferred.resolve(res);
                    }
                });
                                
                return deferred.promise;
            },
            /**
             * Request C.
             * 
             * @param {string} token
             * 
             * @param {string} hash
             * 
             * @return {string} tx number.
             * 
             * @example Identify.RequestC('c3053184574070770f574018a6681e549f6b92a658528ad8f14d6a66c2f9a72ba99e64175d4cc920b8be66a66c2d66756f523c2b3cd6ee3534d0fd67b96c65cd', 'd44d94fcfa245c9c6cc5c53ccda79341ba8d44a1b6e5920021fbe0dd9dfcae666653e45d5780db90521fa0114ad41de35565f6e723de292a951004eceeb89e90')
             *          .then(function(result){
             *              console.log("%j", result);
             *          })
             *          .catch(function(error){
             *              console.log("%j", error);
             *          });
             */
            RequestC: function(token, hash){
                var deferred = q.defer();

                common.debug(`function=<RequestC> token=<${token}> hash=<${hash}>`);   

                if(!common.idContract){
                        common.debug('Smart-contract not currently enabled.');
                        deferred.reject(new Error('Smart-contract not currently enabled.'));
                        return deferred.promise;
                }             
                
                var result = common.idContract.RequestC.call(token, hash);
                common.debug(`RequestC result=<${result}>`);
                deferred.resolve(result);

                return deferred.promise;                
            },            
            /**
             * Request without permission.
             * 
             * @param {string} token
             * 
             * @param {string} hash
             * 
             * @return {string} tx number.
             * 
             * @example Identify.Request('c3053184574070770f574018a6681e549f6b92a658528ad8f14d6a66c2f9a72ba99e64175d4cc920b8be66a66c2d66756f523c2b3cd6ee3534d0fd67b96c65cd', 'd44d94fcfa245c9c6cc5c53ccda79341ba8d44a1b6e5920021fbe0dd9dfcae666653e45d5780db90521fa0114ad41de35565f6e723de292a951004eceeb89e90');
             *          .then(function(txHash){
             *              console.log(txHash);
             *          })
             *          .catch(function(error){
             *              console.log("%j", error);
             *          });
             */
            Request: function(token, hash){
                var deferred = q.defer();

                common.debug(`function=<Request> hash=<${hash}> token=<${token}>`);            

                if(!common.idContract){
                    common.debug('Smart-contract not currently enabled.');
                    deferred.reject(new Error('Smart-contract not currently enabled.'));
                    return deferred.promise;
                }    
                common.idContract.Request.sendTransaction(token, hash, function(err, res){
                    if(err){
                        common.debug(`Request result error: ${err}`);
                        deferred.reject(new Error(err));
                    } else {
                        common.debug(`Request result ${res}`);
                        deferred.resolve(res);
                    }
                });

                return deferred.promise;
            }
        }
    })(Common);

    return id;
}));