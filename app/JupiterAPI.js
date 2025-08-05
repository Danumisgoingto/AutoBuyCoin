
import { ComputeBudgetProgram, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import axios, { all } from "axios"
import Utils from './Utils.js';
import Const from './Const.js';
import MakeTransaction from './MakeTransaction.js';
import AppData from './AppData.js';
import { RPCConnect } from './RPCHelper.js';


export default class JupiterAPI
{
    /** 
     * slipage 100即为1% 
     **/
    static async trade(wallet, buyCoin, useCoin, amount, priorityFee, jitoTips, slipage = 100)
    {
        var quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${useCoin}&outputMint=${buyCoin}&amount=${amount}&slippageBps=50`
        var quoteResponse = await axios.get(quoteUrl, {httpsAgent: Const.AGENT})    

        return this.tradeWithQuote(wallet, quoteResponse.data, priorityFee, jitoTips, slipage)
    }


    /** 
     * slipage 100即为1% 
     **/
    static async tradeWithQuote(wallet, quote, priorityFee, jitoTips, slipage, swapCount = 1)
    {
        var tx = await this.getJupiterSwapTx(wallet, quote, priorityFee, jitoTips, slipage, swapCount)
        
        var waitSimulateRst = RPCConnect.slowConnect.simulateTransaction(tx, {commitment: "confirmed"}).catch((err)=>{Utils.log(`simulateTransaction 报错 ${err.message} `)})

        var sendTipsInst = MakeTransaction.sendTipsInstruct(wallet, 0.000001)
        var computeUnitsInst = ComputeBudgetProgram.setComputeUnitLimit({units: 1000000,}); 
        var sendTipsTx = MakeTransaction.getTx([wallet], wallet, computeUnitsInst, sendTipsInst)

        var rst = await MakeTransaction.sendBundles([tx, sendTipsTx])

        Utils.log(`what s the tx  ${rst}`)
        return {txid: rst || "", waitSimulateRst}
    }


    static async tradeWithQuoteInBundle(wallet, quote, priorityFee, jitoTips, slipage, swapCount = 1, txNum = 1)
    {
        var waitTxArr = []
        for (var i = 0; i < txNum - 1; i++)
        {
            waitTxArr.push(this.getJupiterSwapTx(wallet, quote, priorityFee, 0, slipage, swapCount))
        }
        waitTxArr.push(this.getJupiterSwapTx(wallet, quote, priorityFee, jitoTips, slipage, swapCount))
        

        var txArr = await Promise.all(waitTxArr)
        var rst = await MakeTransaction.sendBundles(txArr)

        Utils.log(`what s the bundle  ${rst}`)
        return rst
    }



    static async getJupiterSwapTx(wallet, quote, priorityFee, jitoTips, slipage, swapCount = 1)
    {
        var curTime = Date.now()
        Utils.log(` 开始 getJupiterSwapTx priorityFee: ${priorityFee}  jitoTips: ${jitoTips} `)
        if (swapCount > 5)
            throw new Error(" 应该最多支持5个swap在一个交易里 ")

        var postUrl = "https://quote-api.jup.ag/v6/swap"
        var data = 
        {
            quoteResponse: quote,
            // user public key to be used for the swap
            userPublicKey: wallet.publicKey.toString(),
            // auto wrap and unwrap SOL. default is true
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true, // allow dynamic compute limit instead of max 1,400,000
            dynamicSlippage: {"minBps": slipage, "maxBps": slipage},
            prioritizationFeeLamports:
            {
                //这里即使没有设置jitoTips仍然保留1000，是为了使指令结构稳定，后续修改指令不用分类讨论，
                //如果没设置jitoTips会直接把转账指令删除
                jitoTipLamports: jitoTips ? Math.floor(jitoTips * LAMPORTS_PER_SOL) : 1000, 
            }
        }
        var swapTransaction = await axios.post(postUrl, data, {headers: {'Content-Type': 'application/json'}, httpsAgent: Const.AGENT})

        var swapTransactionBuf = Buffer.from(swapTransaction.data.swapTransaction, 'base64');
        var transaction = VersionedTransaction.deserialize(swapTransactionBuf);    

        Utils.log(` 得到FromJupiter耗时:  ${Date.now() - curTime} `)

        var allInstruct = []
        allInstruct.push( ComputeBudgetProgram.setComputeUnitLimit({units: 1_400_000}) );

        if (priorityFee && priorityFee > 0)
        {
            var priorityFeeInstuct = ComputeBudgetProgram.setComputeUnitPrice({
                microLamports: Math.floor(priorityFee * LAMPORTS_PER_SOL)
            });
            allInstruct.push(priorityFeeInstuct)
        }

        AppData.latestBlock = {blockhash: transaction.message.recentBlockhash}
        var myStructTx = MakeTransaction.getTx([wallet], wallet, ...allInstruct)

        myStructTx.message.compiledInstructions[0].programIdIndex = transaction.message.compiledInstructions[0].programIdIndex
        transaction.message.compiledInstructions[0] = myStructTx.message.compiledInstructions[0]
        var needInsert = []
        if (myStructTx.message.compiledInstructions.length > 1)
        {
            myStructTx.message.compiledInstructions[1].programIdIndex = transaction.message.compiledInstructions[0].programIdIndex
            needInsert.push(myStructTx.message.compiledInstructions[1])
        }
        if (swapCount > 1)
        {
            for (var i = 0; i < swapCount - 1; i++)
            {
                needInsert.push(transaction.message.compiledInstructions[1])
            }
        }

        if (!jitoTips)
        {
            transaction.message.compiledInstructions.pop()
        }

        transaction.message.compiledInstructions.splice(1, 0, ...needInsert)

        transaction.sign([wallet]);
        transaction.__signer = [wallet]

        Utils.log(` getJupiterSwapTx结束 `)
        return transaction
    }

}



