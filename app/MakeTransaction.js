import { ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram, Transaction, TransactionMessage, VersionedTransaction, sendAndConfirmTransaction } from "@solana/web3.js";
import MyWallet from "./MyWallet.js";
import Utils from "./Utils.js";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createTransferInstruction, getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import BN from "bn.js"
import AppData from "./AppData.js";
import { Buffer } from "buffer";
import pump_fun_idl from "./pump_fun_idl.js";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes/index.js";
import axios from "axios";
import { RPCConnect, RPCHelper } from "./RPCHelper.js";
import Const from "./Const.js";
import { createBurnInstruction } from "@solana/spl-token";
import { unpackAccount } from "@solana/spl-token";
import { createCloseAccountInstruction } from "@solana/spl-token";


export default class MakeTransaction
{
    /**
     *"publicKeys": {
      "pumpProgramId": "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
      "globalAddress": "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf",
      "feeRecipient": "CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM",
      "eventAuthority": "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1"
    },
     */

    static idl = pump_fun_idl
    static PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
    static GLOBAL_ADDRESS = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf"
    static MINT_AUTHORITY = new PublicKey("TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM")
    static FEE_RECIPIENT = "CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM"
    static EVENT_AUTHORITY = "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1"
    static MPL_TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
    static METADATA_SEED = "metadata";
    static BONDING_CURVE_SEED = "bonding-curve"
    static CREATOR_VAULT_SEED = "creator-vault"

    static TIP_ACCOUNTS = [
        '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
        'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
        'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
        'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
        'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
        'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
        'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
        '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
    ].map((pubkey) => new PublicKey(pubkey));


    //usa
    // static JITO_DOMAIN = "https://slc.mainnet.block-engine.jito.wtf"
    static JITO_DOMAIN // = "https://ny.mainnet.block-engine.jito.wtf"
    // //france
    // static JITO_DOMAIN = "https://frankfurt.mainnet.block-engine.jito.wtf"


    static JITO_LAST_SEND_TIME = null




    static async sendTx(tx, jitoTips = 0, connection = null, needSimulate = false, skipPreflight = true)
    {
        if (jitoTips <= 0)
        {
            if (needSimulate)
            {
                var rst = await (connection || RPCConnect.getFastConnect()).simulateTransaction(tx, {commitment: "confirmed"})
            }

            if (!needSimulate || !rst.value.err)
            {
                if (needSimulate)
                {
                    Utils.log(` 通过模拟，正式交易 `)
                }

                try
                {
                    var signature = await (connection || RPCConnect.getFastConnect()).sendTransaction(tx, {
                        skipPreflight,
                    });
                }
                catch(err)
                {
                    return
                }
    
                return signature
            }
            else
            {
                Utils.log(` 交易出错！！！  ${rst.value.logs[rst.value.logs.length - 1]}`)
            }
        }
        else
        {
            var signedTx = Buffer.from(tx.serialize()).toString("base64")
            var sendTojitoUrl = `${this.JITO_DOMAIN}/api/v1/transactions?bundleOnly=true`
            var data = 
            {
                "id": 1,
                "jsonrpc": "2.0",
                "method": "sendTransaction",
                "params": 
                [
                    signedTx,
                    {
                        "encoding": "base64"
                    }
                ]
            }

            if (this.JITO_LAST_SEND_TIME != null)
            {
                var shouldWait = 1060 - (Date.now() - this.JITO_LAST_SEND_TIME)
                if (shouldWait > 0)
                {
                    Utils.log(` JITO避免报错、等待${shouldWait}  `)
                    await new Promise((resolve)=>{ setTimeout(resolve, shouldWait) })
                }
            }
            this.JITO_LAST_SEND_TIME = Date.now()

            if (AppData.interruptTx)
            {
                AppData.interruptTx = false
                return "交易中止"
            }

            var jitoResponse
            try
            {
                AppData.isSendingTx = true
                jitoResponse = await axios.post(sendTojitoUrl, data, {headers: {'Content-Type': 'application/json'}, httpAgent: Const.AGENT, httpsAgent: Const.AGENT})
                AppData.isSendingTx = false
            }
            catch(err)
            {
                // // Utils.log(` sendTx error ${JSON.stringify(err, null, 4)} `)
                // throw err

                Utils.log(` 发送交易失败，${err.message}  `)
                // await RPCConnect.setLatestBlockhash()
                // jitoResponse = await axios.possendTojitoUrlt(, data, {headers: {'Content-Type': 'application/json'}, httpAgent: Const.AGENT, httpsAgent: Const.AGENT})
                // AppData.isSendingTx = false
                return null
            }

            // RPCConnect.setLatestBlockhash()
            return jitoResponse.data.result;
        }

        // var rst = await RPCConnect.slowConnect.simulateTransaction(tx, {commitment: "confirmed"})
        // // console.log(rst)
        // if (!rst.value.err)
        //     return true
        // else
        // {
        //     Utils.log(` 交易出错！！！  ${rst.value.logs[rst.value.logs.length - 1]}`)
        //     return false
        // }
    }


    static async sendTxShyft(tx)
    {
        var signedTx = Buffer.from(tx.serialize()).toString("base64")
        var url = `https://api.shyft.to/sol/v1/transaction/send_txn`
        var data = 
        {
            network: "mainnet-beta",
            encoded_transaction: signedTx
        }

        try
        {
            var response = await axios.post(url, data, {headers: {"x-api-key": "laLZGeJ5lx8xxnLB"}, httpsAgent: Const.AGENT})
        }
        catch(err)
        {
            Utils.log(` 交易出错！！！  ${err.message}`)
        }

        return response?.data?.result?.signature
    }



    static async sendBundles(txArr)
    {
        var signTxArr = []
        for(var tx of txArr)
        {
            var signedTx = Buffer.from(tx.serialize()).toString("base64")
            signTxArr.push(signedTx)
        }

        var sendTojitoUrl = `${this.JITO_DOMAIN}/api/v1/bundles`
        var data = 
        {
            "id": 1,
            "jsonrpc": "2.0",
            "method": "sendBundle",
            "params": 
            [
                signTxArr,
                {
                    "encoding": "base64"
                }
            ]
        }

        // if (this.JITO_LAST_SEND_TIME != null)
        // {
        //     var shouldWait = 1200 - (Date.now() - this.JITO_LAST_SEND_TIME)
        //     if (shouldWait > 0)
        //     {
        //         Utils.log(` JITO避免报错、等待${shouldWait}  `)
        //         await new Promise((resolve)=>{ setTimeout(resolve, shouldWait) })
        //     }
        // }
        // this.JITO_LAST_SEND_TIME = Date.now()

        var retryNum = 0
        while(true)
        {
            try
            {
                var jitoResponse = await axios.post(sendTojitoUrl, data, {headers: {'Content-Type': 'application/json', httpAgent: Const.AGENT, httpsAgent: Const.AGENT}})
                return jitoResponse?.data?.result;
            }
            catch(err)
            {
                Utils.log(` 发送交易出错  ${err.message} `)
                retryNum++
                if (retryNum >=5)
                    return
                else
                    await new Promise((resolve)=>{ setTimeout(resolve, 10) })
            }
        }

        // for(var tx of txArr)
        // {
        //     var rst = await RPCConnect.spareSlowConnect.simulateTransaction(tx, {commitment: "confirmed"})
        //     console.log(rst)
        // }
    }




    static getRandomJitoTipAccount()
    {
        var randomIndex = Math.floor(Math.random() * this.TIP_ACCOUNTS.length)
        Utils.log(` 给Tips的index是 ${randomIndex}  `)
        return  this.TIP_ACCOUNTS[randomIndex];
    }




}