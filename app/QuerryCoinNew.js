import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import fs from "fs"
import { RPCConnect, RPCHelper } from "./RPCHelper.js";
import Utils from './Utils.js';
import Const from './Const.js';
import WebSocket from 'ws';
import AppData from './AppData.js';
import MakeTransaction from './MakeTransaction.js';
import MyWallet from './MyWallet.js';
import axios from 'axios';
import JupiterAPI from './JupiterAPI.js';
import CheckNeedtoDestroyVPS from '../secure/CheckNeedtoDestroyVPS.js';
import SendMail from './SendMail.js';
import { Jupiter } from '@jup-ag/core';
import { PublicKey } from '@solana/web3.js';
import JSBI from 'jsbi';
import { ComputeBudgetProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { unpackAccount } from '@solana/spl-token';
import { createBurnInstruction } from '@solana/spl-token';
import { createCloseAccountInstruction } from '@solana/spl-token';
import { bs58 } from '@project-serum/anchor/dist/cjs/utils/bytes/index.js';
import JupiterRouteHelper from './JupiterRouteHelper.js';





export default class QuerryCoinNew
{
    static USDTAdd = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"

    static USDCAdd = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

    static WSOLAdd = "So11111111111111111111111111111111111111112"


    static midTokenAddr = {}
    static allMidTokenPairsAddr = {}

    static myUSDTAmount

    static myUSDCAmount

    static lastSolNum
    static lastUSDC

    static todayFirstEarn 

    static jupiter


    static allC2T = []

    static accNeedCloseIns = []

    static erroRoute = {}

    static tradeUSDC =  20_000_000


    static async begin()
    {
        // RPCConnect.listenJitoTips()

        RPCConnect.refreshBlockhashContinuely(RPCConnect.jupiterConnect)

        AppData.mainWindow.webContents.send("initBeginTime", AppData.beginDate)

        Utils.log(`begin !!!!!`)

        if (Const.IS_DEBUG)
        {
            AppData.money = 200
        }
        else
        {
            await Utils.checkUsdPerSol()
            var [hasErr, solNum] = await this.getSolAmount()
            if (hasErr)
                return

            var newAccNum = await this.getNewAcc()
            var realSolNum = solNum / LAMPORTS_PER_SOL
            solNum = realSolNum + 0.002 * newAccNum
            this.lastSolNum = realSolNum

            var [hasErr, usdcAmount] = await this.getUSDCAmount()
            if (hasErr)
                return
            this.myUSDCAmount = usdcAmount 
            this.lastUSDC = this.myUSDCAmount
            var [hasErr, usdtAmount] = [false, 0]//await this.getUSDTAmount()
            if (hasErr)
                return
            this.myUSDTAmount = usdtAmount
            Utils.log(`solNum: ${realSolNum}  USDC: ${this.myUSDCAmount / 10**6}  USDT: ${this.myUSDTAmount / 10**6}  `)
            AppData.money = this.myUSDTAmount / 10**6 + this.myUSDCAmount / 10**6 + solNum * AppData.sol2Usd
            AppData.income = AppData.money - (AppData.originSolNum * AppData.sol2Usd + AppData.originUSDCNum)
        }
        // AppData.mainWindow.webContents.send("refreshLeftMoney", AppData.money)
        // AppData.mainWindow.webContents.send("refreshIncome", AppData.income, AppData.income * Const.Usd2Rmb)
        AppData.mainWindow.webContents.send("refreshMyCoin", realSolNum, this.myUSDCAmount / 10**6, this.myUSDTAmount / 10**6)
        AppData.mainWindow.webContents.send("refreshEarn", AppData.todayEarn, AppData.income)

        Utils.log(`开始加载jupiter`)


        // var response = await axios.get("https://cache.jup.ag/markets?v=3", {httpsAgent: Const.AGENT})
        // var marketsCache = []
        // let totalNum = response.data.length
        // let curDeal = 0
        // for(var info of response.data)
        // {
        //     var hasTwoToken = 0
        //     var buff = Buffer.from(info.data[0], info.data[1])
        //     for (var i = 0; i < buff.length - 32; i++)
        //     {
        //         var tokenAddress = bs58.encode( buff.subarray(i, i+32) ) 
        //         if (this.midToken.indexOf(tokenAddress) != -1)
        //         {
        //             hasTwoToken++
        //         }
        //     }
        //     if (hasTwoToken >= 2)
        //     {
        //         marketsCache.push(info)
        //     }
        //     curDeal++
        //     AppData.mainWindow.webContents.send("refreshExtra", `(${curDeal}/${totalNum})`)
        // }

        // AppData.mainWindow.webContents.send("refreshExtra", ``)
        
        this.jupiter = await Jupiter.load({
			connection: RPCConnect.jupiterConnect,
			cluster: "mainnet-beta",
            // marketsCache,
			user: MyWallet.walletPubKey,
			restrictIntermediateTokens: {intermediateTokens: this.midToken},
			shouldLoadSerumOpenOrders: false,
			wrapUnwrapSOL: true,
            routeCacheDuration: -1,
            usePreloadedAddressLookupTableCache: true,
            // ammsToExclude: {
			// 	'Saber (Decimals)': true,
			// },
		});

        Utils.log(` 初始化成功 ${this.jupiter.tokenRouteSegments.size} `)

        while(AppData.looping)
        {
            let closeResolve = null
            let allProgramID = []
            let allAccID2AccountData = new Map()
            let allAccID2Mk = new Map()

            let totalNum = this.buyTokens.length
            let curDeal = 0
            for (var midAddr of this.buyTokens)
            {
                if (midAddr == this.USDCAdd)
                    continue
                
                let routeParam = 
                {
                    inputMint: new PublicKey(midAddr), 
                    outputMint: new PublicKey(this.USDCAdd),
                    onlyDirectRoutes: false,
                    swapMode: 'ExactIn',
                    asLegacyTransaction: false,
                    amount: JSBI.BigInt( this.tradeUSDC ),
                    slippageBps: 4,
                    forceFetch: true,
                    filterTopNResult: 2,

                    allAccID2AccountData,
                }
                
                let firstRoutes = await this.jupiter.computeRoutes(routeParam).catch((err)=>
                { 
                    Utils.log(`C2T Route  sth wrong ${midAddr}   ${err.message}`) 
                });

                if (!firstRoutes || firstRoutes.routesInfos.length <= 0)
                {
                    curDeal++
                    AppData.mainWindow.webContents.send("refreshExtra", `(${curDeal}/${totalNum})`)
                    continue
                }

                
                for (var programID of firstRoutes.allProgramID)
                {
                    if (allProgramID.indexOf(programID) == -1)
                        allProgramID.push(programID)
                }

                for (var kv of firstRoutes.accID2PairsID)
                {
                    let market = firstRoutes.pairsID2Kt.get(kv[1])
                    let info = allAccID2Mk.get(kv[0])
                    if (!info)
                    {
                        info = new Map()
                        allAccID2Mk.set(kv[0], info)
                    }
                    info.set(`${midAddr}-${this.USDCAdd}`, {market, routeParam})
                }

                for (var kv of firstRoutes.accID2AccoutData)
                {
                    if (!allAccID2AccountData.has(kv[0]))
                        allAccID2AccountData.set(kv[0], kv[1])
                }

                curDeal++
                AppData.mainWindow.webContents.send("refreshExtra", `(${curDeal}/${totalNum})`)
            }

            AppData.mainWindow.webContents.send("refreshExtra", ``)
    
            let isChecking = false
            JupiterRouteHelper.addListen(allAccID2Mk, allAccID2AccountData, allProgramID, async (routeParam)=>
            {
                if (isChecking)
                    return
                
                isChecking = true
                routeParam.forceFetch = false
                await QuerryCoinNew.checkPrice(routeParam)
                isChecking = false
            }, ()=>
            {
                closeResolve()
            })

            await new Promise((resolve)=> closeResolve = resolve)
        }

    }


    static async checkPrice(routeParam)
    {
        var errorCount = 0

        var waitAlittle = new Promise((resolve)=> setTimeout(resolve, 100))
        var hasErr = false
        var curTime = Date.now()
        var C2TRoutes = await this.jupiter.computeRoutes(routeParam).catch((err)=>
        { 
            Utils.log(`C2T Route  sth wrong ${routeParam.outputMint}  ${err.message}`) 
        });

        if (!C2TRoutes || C2TRoutes.routesInfos.length <= 0)
        {
            console.log(` no Route  ${midTokenPublicKey.toString()} `)
            await waitAlittle
            return
        }

        AppData.mainWindow.webContents.send("refreshRouteCost", ((Date.now() - curTime)/1000).toFixed(3), routeParam.outputMint.toString())

        if (T2CRoutes && T2CRoutes.routesInfos.length > 0 
            && JSBI.toNumber( T2CRoutes.routesInfos[0].outAmount ) - this.tradeUSDC > 0.000015 * AppData.tokenInfo[this.WSOLAdd].onePerUSD)
        {
            let lastUSDC = this.myUSDCAmount
            Utils.log(`====================================`)
            Utils.log(`开始交易 ${routeParam.outputMint.toString()} jitoTips: ${AppData.jitoTips}  预计获得 ${T2CRoutes.routesInfos[0].outAmount}`)
            Utils.log(`C2TRoutePlan:  ${c2tRoutePlane} `)
            try
            {
                let wallet
                var allWait = []
                allWait.push(this.jupiter.exchange({routeInfo:  C2TRouteRst, blockhashWithExpiryBlockHeight: AppData.latestBlock, jitoTipsInst: sendTipsInst}))
                var [C2TTx] = await Promise.all(allWait)
                
                C2TTx.swapTransaction.sign([wallet]);

                var waitSimulateC2TRst = RPCConnect.slowConnect.simulateTransaction(C2TTx.swapTransaction, {commitment: "confirmed"}).catch((err)=>{Utils.log(`simulateTransaction 报错 ${err.message} `)})
                var txid = await MakeTransaction.sendBundles([C2TTx.swapTransaction])
            }
            catch(err)
            {
                this.erroRoute[c2tRoutePlane] = true
                Utils.log(` 报错！！ ${err.message} `)
                hasErr = true
            }

            if (hasErr)
            {
                Utils.log(`====================================`)
                return
            }

            if (!txid || txid == "")
            {
                Utils.log(`====================================`)
                return
            }

            var C2TRst = waitSimulateC2TRst && await waitSimulateC2TRst.catch((err)=>{})
            if (C2TRst && C2TRst.value.err)
            {
                hasErr = true
                var errDetail = C2TRst.value.logs && C2TRst.value.logs.length > 0 
                    ? C2TRst.value.logs[C2TRst.value.logs.length - 1]
                    : ""
                Utils.log(`C2T 交易出错！！！${C2TRst.value.err}   ${errDetail}`)

                if (errDetail && (errDetail.includes("0x1771") 
                    || errDetail.includes("0x9ca") 
                    || C2TRst.value.logs[C2TRst.value.logs.length - 2].match(/Transfer: insufficient lamports \d+, need \d+/g)
                    || C2TRst.value.logs[C2TRst.value.logs.length - 7].match(/insufficient funds/g)))
                {
                    //滑点不足
                    Utils.log(`应该是滑点不足`)
                    await this.jupiter.updateMarketAccData(C2TRouteRst.marketInfos, routeParam.allAccID2AccountData)
                }
                else
                {
                    fs.appendFile(`${AppData.appPath}/log/FailTx.log`, `

${JSON.stringify(C2TRst.value.logs, null, 4)}`, Utils.writeErrFileCallback)

                    this.erroRoute[c2tRoutePlane] = true
                }
            }

            if (hasErr)
            {
                Utils.log(`====================================`)
                return
            }

            await new Promise((resolve)=> setTimeout(resolve, 15000))
            
            var noTradeUSDC = this.myUSDCAmount - this.tradeUSDC

            var [hasErr, usdcAmount] = await this.getUSDCAmount()
            if (hasErr)
                return
            
            
            if (usdcAmount == lastUSDC)
            {
                Utils.log(` 有问题，USDC还是一样！！！！ `)

                await new Promise((resolve)=>{ setTimeout(resolve, 5000) })

                var [hasErr, usdcAmount] = await this.getUSDCAmount()
                if (hasErr)
                    return

                if (usdcAmount == lastUSDC)
                {
                    Utils.log(` 6秒之后USDC还是一样，所以认为还是赎回失败？？ `)
                    Utils.log(`====================================`)

                    errorCount++
                    if (errorCount >= 3)
                    {
                        // midTokenIndex = (midTokenIndex + 1) % this.buyTokens.length 
                        errorCount = 0
                    }
                    return
                }
            }

            this.myUSDCAmount = usdcAmount

            await Utils.checkUsdPerSol()
            var [hasErr, solNum] = await this.getSolAmount()
            if (hasErr)
                return

            var newAccNum = await this.getNewAcc()

            var realSolNum = solNum / LAMPORTS_PER_SOL
            solNum = realSolNum + 0.002 * newAccNum
            AppData.money = this.myUSDTAmount / 10**6 + this.myUSDCAmount / 10**6 + solNum * AppData.sol2Usd
            AppData.income = AppData.money - (AppData.originSolNum * AppData.sol2Usd + AppData.originUSDCNum)
            var earn = (this.myUSDCAmount - this.lastUSDC) / 10**6 + (solNum - this.lastSolNum) * AppData.sol2Usd
            this.lastUSDC = this.myUSDCAmount
            this.lastSolNum = realSolNum

            if (!this.todayFirstEarn || Date.now() - this.todayFirstEarn > 24 * 60 * 60 * 1000)
            {
                this.todayFirstEarn = Date.now()
                AppData.todayEarn = earn
            }
            else
            {
                AppData.todayEarn += earn
            }

            // AppData.mainWindow.webContents.send("refreshLeftMoney", AppData.money)
            // AppData.mainWindow.webContents.send("refreshIncome", AppData.income, AppData.income * Const.Usd2Rmb)
            AppData.mainWindow.webContents.send("refreshMyCoin", realSolNum, this.myUSDCAmount / 10**6, this.myUSDTAmount / 10**6)
            AppData.mainWindow.webContents.send("refreshEarn", AppData.todayEarn, AppData.income)


            Utils.log(` 交易完成 实际获得: ${this.myUSDCAmount - noTradeUSDC} 新USDC: ${this.myUSDCAmount} ${earn > 0 ? `赚: ${earn.toFixed(5)}(￥${(earn * Const.Usd2Rmb).toFixed(5)})` : `亏: ${earn.toFixed(5)}(￥${(earn * Const.Usd2Rmb).toFixed(5)})`}`)
            Utils.log(`====================================`)

            AppData.lastBuy = Date.now()
        }
        else 
            await waitAlittle
    }



    static async getNewAcc()
    {
        var newAccNum = 0
        this.accNeedCloseIns = []
        var allSPLAcc = await RPCConnect.slowConnect.getTokenAccountsByOwner(MyWallet.walletPubKey, {programId: TOKEN_PROGRAM_ID});
        for(var accountInfo of allSPLAcc.value)
        { 
            var account = unpackAccount(accountInfo.pubkey.toString(), accountInfo.account)

            var tokenAccount = new PublicKey(account.address)
            var mint = account.mint
            var amount = account.amount

            if (mint.toString() == this.USDCAdd || mint.toString() == this.USDTAdd
                || mint.toString() == "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs"
                || mint.toString() == "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh")
                continue

            Utils.log(` 需要退还 ${tokenAccount}  mint: ${mint} `)

            newAccNum++
            if (amount > 0)
            {
                if (amount < 10) //如果少于0.000001就销毁
                {
                    Utils.log(` 添加销毁代币指令 ${amount} `)
                    this.accNeedCloseIns.push(createBurnInstruction(tokenAccount, mint, MyWallet.walletPubKey, amount))
                }
                else
                {
                    Utils.log(` 余额还有很多？？？ ${amount} 跳过 `)
                    continue
                }
            }
            
            this.accNeedCloseIns.push(createCloseAccountInstruction(
                tokenAccount,          // 待关闭的代币账户
                MyWallet.walletPubKey,       // 接收租金返还的地址
                MyWallet.walletPubKey,       // 账户所有者（需签名授权）
            ))
        }

        return newAccNum
    }


    static async getUSDCAmount()
    {
        var usdcAmount
        var hasErr = true 
        var retryTime = 0
        while(hasErr)
        {
            try
            {
                var connect = null
                if (retryTime % 2 == 1)
                {
                    connect = RPCConnect.spareSlowConnect
                }

                let wallet = MyWallet.getWallet(AppData.encryptedPrivateKey, AppData.privateKey, AppData.encryptedPassword)
                usdcAmount = await RPCHelper.getAllUSDC(wallet, connect)
                hasErr = false
            }
            catch(err)
            {
                hasErr = true
                retryTime++

                if (retryTime > 6)
                {
                    Utils.log(` 一直获取不到USDC  `)
                    break
                }
            }
        }
       
        return [hasErr, usdcAmount]
    }


    static async getUSDTAmount()
    {
        var usdtAmount
        var hasErr = true 
        var retryTime = 0
        while(hasErr)
        {
            try
            {
                var connect = null
                if (retryTime % 2 == 1)
                {
                    connect = RPCConnect.spareSlowConnect
                }

                let wallet = MyWallet.getWallet(AppData.encryptedPrivateKey, AppData.privateKey, AppData.encryptedPassword)
                usdtAmount = await RPCHelper.getAllUSDT(wallet, connect)
                hasErr = false
            }
            catch(err)
            {
                hasErr = true
                retryTime++

                if (retryTime > 6)
                {
                    Utils.log(` 一直获取不到USDT  `)
                    break
                }
            }
        }
       
        return [hasErr, usdtAmount]
    }


    static async getSolAmount()
    {
        var solAmount
        var hasErr = true 
        var retryTime = 0
        while(hasErr)
        {
            try
            {
                var connect = null
                if (retryTime % 2 == 1)
                {
                    connect = RPCConnect.spareSlowConnect
                }

                let wallet = MyWallet.getWallet(AppData.encryptedPrivateKey, AppData.privateKey, AppData.encryptedPassword)
                solAmount = await RPCHelper.getAllSol(wallet, connect)
                hasErr = false
            }
            catch(err)
            {
                hasErr = true
                retryTime++

                if (retryTime > 6)
                {
                    Utils.log(` 一直获取不到sol  `)
                    break
                }
            }
        }
       
        return [hasErr, solAmount]
    }


}