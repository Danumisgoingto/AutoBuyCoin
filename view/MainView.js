import terminal from "terminal-kit";
import Const from "../app/Const.js";
import AppData from "../app/AppData.js";


export default class MainView
{
    static drawCount = 0

    static viewData = 
    {
        solNum: 0,
        usdcNum: 0,
        usdtNum: 0,
        todayEarn: 0,
        totalEarn: 0,
        logs: [],
        routeCost: 0,
        routeNum: 0,
        curPrice: 0,
        avdPrice: 0,
        route: "",
        curMidToken: "",
        extra: "",
    }




    static async drawUI(data, force)
    {
        if (!force)
        {
            this.drawCount = (this.drawCount + 1) % 100
            var count = this.drawCount
            await new Promise((resolve)=>{ setTimeout(resolve, 1) })
    
            if (data.logs.length > 15)
            {
                data.logs.splice(0, data.logs.length - 15)
            }
    
            if (count != this.drawCount)
            {
                return
            }
        }

        var t = terminal.terminal
        t.clear()
        t(`${AppData.baseInfo} \n`)
        t(`beginDate:    ${data.beginDate.toLocaleDateString("zh-CN", {timeZone: "Asia/Shanghai"})} ${data.beginDate.toLocaleTimeString("zh-CN", {timeZone: "Asia/Shanghai"})}\n`)
        t(`route耗时: ${data.routeCost}  curMidToken: ${data.curMidToken}\n`)
        t(`---------------------------------\n`)
        t(`sol:    ${data.solNum}\n`)
        t(`usdc:    ${data.usdcNum}\n`)
        t(`usdt:    ${data.usdtNum}\n`)
        t(`---------------------------------\n`)
        t.green(`今日赚:    ${data.todayEarn.toFixed(5)}(￥${(data.todayEarn * Const.Usd2Rmb).toFixed(5)})\n`)
        t.green(`累计赚:    ${data.totalEarn.toFixed(5)}(￥${(data.totalEarn * Const.Usd2Rmb).toFixed(5)})\n`)
        t(`---------------------------------\n`)
        t(`${data.extra}\n`)    

        for(var i = 0; i < data.logs.length; i++)
        {
            t(`${data.logs[i]}\n`)
        }
    }

    static initBeginTime(beginDate)
    {
        this.viewData.beginDate = beginDate

        this.drawUI(this.viewData)
    }

    static refreshRouteCost(cost, curMidToken)
    {
        this.viewData.routeCost = cost
        this.viewData.curMidToken = curMidToken

        this.drawUI(this.viewData)
    }

    static refreshCurPrice(curPrice, avdPrice)
    {
        this.viewData.curPrice = curPrice
        this.viewData.avdPrice = avdPrice

        this.drawUI(this.viewData)
    }

    static refreshRoute(routeStr)
    {
        this.viewData.route = routeStr

        this.drawUI(this.viewData)
    }

    static refreshExtra(extra)
    {
        this.viewData.extra = extra

        this.drawUI(this.viewData, true)
    }



    static refreshMyCoin(solNum, usdcNum, usdtNum)
    {
        this.viewData.solNum = solNum
        this.viewData.usdcNum = usdcNum
        this.viewData.usdtNum = usdtNum

        this.drawUI(this.viewData)
    }


    static refreshEarn(todayEarn, totalEarn)
    {
        this.viewData.todayEarn = todayEarn
        this.viewData.totalEarn = totalEarn

        this.drawUI(this.viewData)
    }


    static log(newLog)
    {
        this.viewData.logs.push(newLog)

        this.drawUI(this.viewData)
    }

}

