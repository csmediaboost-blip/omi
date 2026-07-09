"use client";
// app/dashboard/checkout/page.tsx
// FIXES:
//  [FIX-DECLINED]  Poll DB 30s on ?status=declined before showing "Payment Declined"
//                  Catches race: KoraPay redirect fires before webhook confirms payment
//  [FIX-LOADING-1] Auth + config fetched in PARALLEL (was sequential — caused 3-8s blank screen)
//  [FIX-LOADING-2] payment-config API has 5s timeout with graceful fallback (was infinite hang)
//  [FIX-LOADING-3] Daily limit check runs in background — never blocks page render
//  [FIX-LOADING-4] Page renders country selector immediately; spinner only shown during auth

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PERIOD_DURATIONS_MS } from "@/lib/mining-service";
import type { User } from "@supabase/supabase-js";
import {
  Lock, CheckCircle, ChevronRight, AlertCircle, Loader2,
  ArrowLeft, Clock, ArrowDownToLine, Globe, Shield, Cpu,
  Brain, Server, Copy, Check, RefreshCw, Landmark,
} from "lucide-react";

type CheckoutStep =
  | "country" | "details" | "processing" | "success"
  | "failed" | "pending_crypto" | "declined" | "verifying";
type PayMethod = "card" | "bank_transfer" | "crypto_wallet";
type PurchaseType = "gpu_plan" | "license" | "task";

const MAX_SINGLE_NGN_TXN = 200_000;

type SplitState = {
  totalNGN: number; totalUSD: number; ngnRate: number;
  localCurrency: string; installmentsNGN: number[];
  completed: number; references: string[];
  kpPhone: string; planData: Record<string, any>;
};

const BANK_TRANSFER_COUNTRIES = new Set(["KE","GH","CM","CI","EG","TZ","NG"]);

const CURRENCY_RATES: Record<string, { currency: string; rate: number }> = {
  NG:{currency:"NGN",rate:1600},KE:{currency:"KES",rate:130},
  GH:{currency:"GHS",rate:15},ZA:{currency:"ZAR",rate:18},
  CM:{currency:"XAF",rate:600},CI:{currency:"XOF",rate:600},
  EG:{currency:"EGP",rate:48},TZ:{currency:"TZS",rate:2500},
};

const getPaymentMethodsForCountry=(cc:string,amount:number):PayMethod[]=>{
  const m:PayMethod[]=[];
  if(BANK_TRANSFER_COUNTRIES.has(cc)&&amount<=10000)m.push("bank_transfer");
  m.push("crypto_wallet","card");
  return m;
};

const COUNTRIES=[
  {code:"AF",name:"Afghanistan"},{code:"AL",name:"Albania"},{code:"DZ",name:"Algeria"},
  {code:"AR",name:"Argentina"},{code:"AU",name:"Australia"},{code:"AT",name:"Austria"},
  {code:"BE",name:"Belgium"},{code:"BR",name:"Brazil"},{code:"CA",name:"Canada"},
  {code:"CM",name:"Cameroon (XAF)"},{code:"CI",name:"Côte d'Ivoire (XOF)"},{code:"EG",name:"Egypt (EGP)"},
  {code:"FR",name:"France"},{code:"DE",name:"Germany"},{code:"GH",name:"Ghana (GHS)"},
  {code:"GR",name:"Greece"},{code:"HK",name:"Hong Kong"},{code:"IN",name:"India"},
  {code:"ID",name:"Indonesia"},{code:"IQ",name:"Iraq"},{code:"IE",name:"Ireland"},
  {code:"IT",name:"Italy"},{code:"JP",name:"Japan"},{code:"KE",name:"Kenya (KES)"},
  {code:"LB",name:"Lebanon"},{code:"MY",name:"Malaysia"},{code:"MX",name:"Mexico"},
  {code:"MA",name:"Morocco"},{code:"NL",name:"Netherlands"},{code:"NZ",name:"New Zealand"},
  {code:"NG",name:"Nigeria (NGN)"},{code:"NO",name:"Norway"},{code:"PK",name:"Pakistan"},
  {code:"PH",name:"Philippines"},{code:"PL",name:"Poland"},{code:"PT",name:"Portugal"},
  {code:"QA",name:"Qatar"},{code:"RO",name:"Romania"},{code:"SA",name:"Saudi Arabia"},
  {code:"SG",name:"Singapore"},{code:"ZA",name:"South Africa (ZAR)"},{code:"KR",name:"South Korea"},
  {code:"ES",name:"Spain"},{code:"SE",name:"Sweden"},{code:"CH",name:"Switzerland"},
  {code:"TZ",name:"Tanzania (TZS)"},{code:"TH",name:"Thailand"},{code:"TR",name:"Turkey"},
  {code:"UA",name:"Ukraine"},{code:"AE",name:"United Arab Emirates"},
  {code:"GB",name:"United Kingdom"},{code:"US",name:"United States"},
  {code:"VN",name:"Vietnam"},{code:"ZM",name:"Zambia"},
].sort((a,b)=>a.name.localeCompare(b.name));

const LICENSE_CONFIGS:Record<string,{label:string;icon:any;color:string;features:string[]}>={
  thermal_optimization:{label:"Thermal & Neural Operator License",icon:Cpu,color:"#3b82f6",features:["Daily Thermal Calibration — $0.50/day","Neural Weight Re-alignment — $0.50/day","7-day streak bonus multiplier","Valid 4 years from activation"]},
  rlhf_validation:{label:"RLHF Validation Operator License",icon:Brain,color:"#8b5cf6",features:["Unlimited RLHF task access","$0.10 per validated AI response","Confidence-weighted rewards","Valid 4 years from activation"]},
  gpu_allocation:{label:"GPU Allocation Operator License",icon:Server,color:"#10b981",features:["Live GPU client allocation","Hourly compute revenue share","5 enterprise client tiers","Valid 4 years from activation"]},
  operator_license:{label:"Certified AI Operator License",icon:Shield,color:"#f59e0b",features:["Daily Thermal Calibration — $0.50/day","RLHF Validation — $0.10/task","GPU Client Allocation — hourly revenue","Valid 4 years · Renewable"]},
  api_access:{label:"API Developer Access",icon:Shield,color:"#8b5cf6",features:["Full REST API access","Up to 5 API keys","10,000 requests/day","Lifetime access"]},
};

const PERIOD_LABELS:Record<string,string>={hourly:"1 Hour",daily:"1 Day",weekly:"1 Week",monthly:"1 Month"};
const PROCESSING_STEPS=[
  {id:1,label:"Verifying payment details",ms:1400},
  {id:2,label:"Securing payment channel",ms:1800},
  {id:3,label:"Routing through payment network",ms:2200},
  {id:4,label:"Completing your order",ms:1600},
  {id:5,label:"Activating your mining session",ms:1400},
];

// ── Helpers ────────────────────────────────────────────────────────────────────

// [FIX-LOADING-2] 5s timeout — payment-config was hanging forever
async function fetchWithTimeout(url:string,ms=5000):Promise<Response>{
  const ctrl=new AbortController();
  const id=setTimeout(()=>ctrl.abort(),ms);
  try{const r=await fetch(url,{signal:ctrl.signal});clearTimeout(id);return r;}
  catch(e){clearTimeout(id);throw e;}
}

async function getDailyBankTransferNGNTotal():Promise<number>{
  const today=new Date();today.setHours(0,0,0,0);
  try{
    const{data}=await supabase.from("payment_transactions").select("converted_amount")
      .gte("created_at",today.toISOString()).in("status",["confirmed","completed","pending"]).eq("gateway","korapay");
    return(data??[]).reduce((s:number,tx:any)=>s+(Number(tx.converted_amount)||0),0);
  }catch{return 0;}
}

async function getTotalDailyCapacity():Promise<number>{
  try{
    const{data}=await supabase.from("korapay_accounts").select("daily_limit_ngn").eq("is_active",true);
    if(!data?.length)return 498_000;
    return(data as any[]).reduce((s:number,r:any)=>s+Number(r.daily_limit_ngn),0);
  }catch{return 498_000;}
}

function computeInstallments(total:number):number[]{
  const out:number[]=[];let rem=Math.round(total);
  while(rem>0){const c=Math.min(rem,MAX_SINGLE_NGN_TXN);out.push(c);rem-=c;}
  return out;
}

// [FIX-DECLINED] Poll DB up to 30s — KoraPay redirect fires before webhook confirms
async function pollForPaymentConfirmation(ref:string,attempts=10,intervalMs=3000):Promise<boolean>{
  for(let i=0;i<attempts;i++){
    await new Promise(r=>setTimeout(r,intervalMs));
    try{
      const{data}=await supabase.from("payment_transactions").select("status").eq("gateway_reference",ref).maybeSingle();
      if(data?.status==="confirmed"||data?.status==="completed")return true;
    }catch{}
  }
  return false;
}

async function createMiningAllocation(params:{
  userId:string;planId:string;planName:string;amount:number;
  paymentModel:"flexible"|"contract";instanceType:string;gpuModel?:string;
  vram?:string;miningPeriod?:string;contractMonths?:number;contractLabel?:string;
  contractMinPct?:number;contractMaxPct?:number;lockInMonths?:number;lockInLabel?:string;
  lockInMultiplier?:number;transactionRef?:string;autoReinvest?:boolean;
}):Promise<string|null>{
  const{userId,planId,planName,amount,paymentModel,instanceType,gpuModel,vram,
    miningPeriod="daily",contractMonths,contractLabel,contractMinPct,contractMaxPct,
    lockInMonths,lockInLabel,lockInMultiplier,transactionRef,autoReinvest=false}=params;
  const now=new Date();const nowIso=now.toISOString();
  if(transactionRef){
    const{data:ex}=await supabase.from("node_allocations").select("id").eq("user_id",userId).eq("plan_id",planId).gte("created_at",new Date(Date.now()-600000).toISOString()).limit(1);
    if(ex?.length)return ex[0].id;
  }
  const periodMs=PERIOD_DURATIONS_MS[miningPeriod]??PERIOD_DURATIONS_MS.daily;
  const miningEndsAt=paymentModel==="flexible"?new Date(now.getTime()+periodMs).toISOString():null;
  const maturityDate=paymentModel==="contract"&&contractMonths?new Date(now.getTime()+contractMonths*30*86400000).toISOString():null;
  let rateFactor=0.86;
  try{const{data:rs}=await supabase.from("current_mining_rates").select("rate_factor").eq("plan_id",planId).eq("period",miningPeriod).single();if(rs?.rate_factor!=null)rateFactor=rs.rate_factor;}catch{}
  const payload:Record<string,any>={
    user_id:userId,plan_id:planId,amount_invested:amount,status:"active",
    payment_model:paymentModel,instance_type:instanceType,total_earned:0,
    total_withdrawn:0,created_at:nowIso,updated_at:nowIso,auto_reinvest:autoReinvest,
    ...(paymentModel==="flexible"?{mining_period:miningPeriod,mining_ends_at:miningEndsAt,mining_completed:false,rate_factor_used:rateFactor,capital_returned:false,final_profit:0}:{}),
    ...(paymentModel==="contract"?{contract_months:contractMonths,contract_label:contractLabel,contract_min_pct:contractMinPct,contract_max_pct:contractMaxPct,maturity_date:maturityDate,lock_in_months:lockInMonths,lock_in_label:lockInLabel,lock_in_multiplier:lockInMultiplier,mining_completed:false,rate_factor_used:rateFactor,mining_period:"contract",mining_ends_at:maturityDate}:{}),
  };
  const{data:newAlloc,error:allocErr}=await supabase.from("node_allocations").insert(payload).select("id").single();
  if(allocErr){console.error("[checkout] Alloc insert failed:",allocErr.message);return null;}
  try{await supabase.from("payment_transactions").insert({user_id:userId,node_key:planId,amount,currency:"USD",gateway:"gpu_mining",gateway_reference:newAlloc.id,status:"confirmed",verified_by_admin:false,created_at:nowIso,confirmed_at:nowIso,metadata:JSON.stringify({purchaseType:paymentModel==="contract"?"gpu_contract":"gpu_mining",planName,gpuModel,miningPeriod,allocationId:newAlloc.id,transactionRef:transactionRef??null})});}catch{}
  return newAlloc.id;
}

// ── UI Components ──────────────────────────────────────────────────────────────

function QRCode({value,size=160}:{value:string;size?:number}){
  return<img src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=1a1f2e&color=ffffff&margin=12`} alt="QR Code" width={size} height={size} className="rounded-xl" onError={(e)=>{(e.target as HTMLImageElement).style.display="none";}}/>;
}

function CopyButton({text}:{text:string}){
  const[copied,setCopied]=useState(false);
  return<button onClick={()=>{navigator.clipboard.writeText(text).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});}} className="shrink-0 p-1.5 rounded-lg transition-all hover:bg-white/10">{copied?<Check size={14} className="text-emerald-400"/>:<Copy size={14} className="text-slate-400"/>}</button>;
}

function SplitPaymentModal({state,loading,error,onInitiate,onCancel}:{state:SplitState;loading:boolean;error:string;onInitiate:(s:SplitState)=>void;onCancel:()=>void;}){
  const paidNGN=state.installmentsNGN.slice(0,state.completed).reduce((s,v)=>s+v,0);
  const progressPct=state.totalNGN>0?(paidNGN/state.totalNGN)*100:0;
  const isFirst=state.completed===0;
  const totalCount=state.installmentsNGN.length;
  const currentInstallmentNGN=state.completed<totalCount?state.installmentsNGN[state.completed]:0;
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.92)",backdropFilter:"blur(12px)"}}>
      <div className="w-full max-w-lg rounded-3xl overflow-hidden" style={{background:"rgb(8,12,22)",border:"1px solid rgba(245,158,11,0.35)"}}>
        <div className="px-6 pt-6 pb-5" style={{background:"rgba(245,158,11,0.07)",borderBottom:"1px solid rgba(245,158,11,0.2)"}}>
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.3)"}}><Landmark size={20} className="text-amber-400"/></div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-400 mb-1">Regulatory Compliance · Installment Processing</p>
              <h3 className="text-white font-black text-lg leading-tight">{isFirst?"Payment Split Required":`Installment ${state.completed} of ${totalCount} Complete`}</h3>
              {!isFirst&&<p className="text-emerald-400 text-sm font-bold mt-1 flex items-center gap-1.5"><CheckCircle size={12}/>₦{state.installmentsNGN[state.completed-1].toLocaleString()} received</p>}
            </div>
          </div>
        </div>
        <div className="mx-5 mt-5 rounded-2xl p-4" style={{background:"rgba(15,23,42,0.9)",border:"1px solid rgba(100,116,139,0.2)"}}>
          <div className="flex items-start gap-3"><Shield size={14} className="text-slate-400 mt-0.5 shrink-0"/>
            <p className="text-slate-500 text-[11px] leading-relaxed">Per AML regulations, bank transfers are capped at <strong className="text-slate-300">₦200,000 per transaction</strong>. Your service activates once all installments clear. <strong className="text-slate-300">No extra fees.</strong></p>
          </div>
        </div>
        <div className="px-5 mt-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Payment Plan</p>
            <p className="text-slate-400 text-xs">Total: <span className="text-white font-black">₦{state.totalNGN.toLocaleString()}</span> <span className="text-slate-600">(${state.totalUSD.toFixed(2)})</span></p>
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-slate-600 mb-1.5"><span>₦{paidNGN.toLocaleString()} paid</span><span>{progressPct.toFixed(0)}% complete</span><span>₦{(state.totalNGN-paidNGN).toLocaleString()} remaining</span></div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-2 rounded-full transition-all duration-700" style={{width:`${progressPct}%`,background:"linear-gradient(90deg,#f59e0b,#10b981)"}}/></div>
          </div>
          <div className="space-y-2">
            {state.installmentsNGN.map((amt,i)=>{
              const isPaid=i<state.completed,isCurrent=i===state.completed;
              return(
                <div key={i} className="flex items-center justify-between rounded-xl px-4 py-3" style={{background:isPaid?"rgba(16,185,129,0.07)":isCurrent?"rgba(245,158,11,0.07)":"rgba(15,23,42,0.6)",border:isPaid?"1px solid rgba(16,185,129,0.25)":isCurrent?"1px solid rgba(245,158,11,0.3)":"1px solid rgba(255,255,255,0.05)"}}>
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black" style={{background:isPaid?"rgba(16,185,129,0.2)":isCurrent?"rgba(245,158,11,0.2)":"rgba(100,116,139,0.15)",color:isPaid?"#10b981":isCurrent?"#f59e0b":"#475569"}}>{isPaid?<CheckCircle size={12}/>:i+1}</div>
                    <p className={`text-sm font-black ${isPaid?"text-emerald-300":isCurrent?"text-amber-300":"text-slate-500"}`}>Installment {i+1} of {totalCount}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-black text-sm ${isPaid?"text-emerald-400":isCurrent?"text-amber-400":"text-slate-600"}`}>₦{amt.toLocaleString()}</p>
                    <p className="text-[10px]" style={{color:isPaid?"#059669":isCurrent?"#d97706":"#334155"}}>{isPaid?"✓ Paid":isCurrent?"→ Next":"○ Pending"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {error&&<div className="mx-5 mt-3 rounded-xl p-3 flex items-start gap-2" style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)"}}><AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0"/><p className="text-red-300 text-xs">{error}</p></div>}
        <div className="px-5 py-5 space-y-3 mt-1">
          <button onClick={()=>onInitiate(state)} disabled={loading} className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 disabled:opacity-60" style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#0c0a00"}}>
            {loading?<><Loader2 size={16} className="animate-spin"/>Connecting…</>:isFirst?<><Landmark size={16}/>Begin — ₦{state.installmentsNGN[0].toLocaleString()}</>:<><Landmark size={16}/>Continue {state.completed+1}/{totalCount}: ₦{currentInstallmentNGN.toLocaleString()}</>}
          </button>
          <button onClick={onCancel} disabled={loading} className="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50" style={{background:"rgba(139,92,246,0.12)",border:"1px solid rgba(139,92,246,0.35)",color:"#a78bfa"}}>₿ Pay with Crypto · 💳 Pay with Card</button>
          <p className="text-slate-600 text-[11px] text-center pb-1">Tap above to cancel split and choose different payment</p>
        </div>
      </div>
    </div>
  );
}

function Receipt({data,onClose}:{data:{txId:string;purchaseType:PurchaseType|"api_access";nodeName:string;amount:number;gpu:string;vram:string;payMethod:string;country:string;date:string;paymentModel:string;contractLabel:string;contractMonths:number;licenseType:string;miningPeriod:string;discounted?:boolean;walletAddress?:string;};onClose:()=>void;}){
  const ref=useRef<HTMLDivElement>(null);
  const isContract=data.paymentModel==="contract";
  const licConfig=LICENSE_CONFIGS[data.licenseType]??LICENSE_CONFIGS.operator_license;
  const periodLabel=data.purchaseType==="api_access"?"Lifetime":PERIOD_LABELS[data.miningPeriod]??data.miningPeriod;
  const contractDurLabel=data.contractMonths===6?"6 months":data.contractMonths===12?"12 months":"2 years";
  const rows=data.purchaseType==="api_access"
    ?[["Transaction ID",data.txId],["Date & Time",data.date],["Product","API Developer Access"],["Access Level","Full — All Endpoints"],["Amount Paid",`$${data.amount.toFixed(2)}`],["Payment Method",data.payMethod],["Country",data.country],["Status","Access Activated"]]
    :data.purchaseType==="license"
    ?[["Transaction ID",data.txId],["Date & Time",data.date],["License Type",licConfig.label],["Validity","4 years from activation"],["Amount Paid",`$${data.amount.toFixed(2)}${data.discounted?" (Crypto discount)":""}`],["Payment Method",data.payMethod],["Country",data.country],["Status","License Activated"]]
    :[["Transaction ID",data.txId],["Date & Time",data.date],["Node Allocated",data.nodeName],["GPU Model",data.gpu],["VRAM",data.vram],["Payment Model",isContract?`Contract — ${contractDurLabel}`:"Pay-As-You-Go"],["Mining Session",isContract?contractDurLabel:periodLabel],["Amount Paid",`$${data.amount.toFixed(2)}${data.discounted?" (Crypto discount)":""}`],["Payment Method",data.payMethod],...(data.walletAddress?[["Sender Wallet",data.walletAddress]]:[]),["Country",data.country],["Status","Mining Active"]];
  return(
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="max-w-md w-full rounded-2xl overflow-hidden" style={{background:"rgb(10,16,28)",border:"1px solid rgba(255,255,255,0.1)"}} onClick={(e:React.MouseEvent)=>e.stopPropagation()}>
        <div ref={ref}>
          <div className="p-6 text-center" style={{background:"linear-gradient(135deg,rgba(16,185,129,0.15),rgba(6,12,24,0.9))"}}>
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-3"><CheckCircle size={22} className="text-emerald-400"/></div>
            <h3 className="text-white font-black text-lg">Payment Receipt</h3>
            <p className="text-slate-400 text-xs mt-1">OmniTask Pro · {data.purchaseType==="api_access"?"API Developer Access":data.purchaseType==="license"?"Operator License":"GPU Mining Session"}</p>
          </div>
          <div className="px-6"><div className="border-t border-dashed border-slate-700"/></div>
          <div className="px-6 py-5 space-y-3 text-sm">
            {(rows as [string,string][]).map(([l,v])=>(
              <div key={l} className="flex justify-between items-start"><span className="text-slate-500 shrink-0 mr-4">{l}</span><span className="text-white font-semibold text-right break-all">{v}</span></div>
            ))}
          </div>
          <div className="px-6"><div className="border-t border-dashed border-slate-700"/></div>
          <div className="px-6 py-4 text-center"><p className="text-slate-600 text-[11px] leading-relaxed">{data.purchaseType==="api_access"?"Your API access is now active.":data.purchaseType==="license"?"Your license is now active.":isContract?"Earnings accrue daily and unlock at contract maturity.":"Mining has started. View live earnings in your portfolio."}</p></div>
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <button onClick={()=>{if(!ref.current)return;const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([ref.current.innerText],{type:"text/plain"}));a.download=`OmniTask-Receipt-${data.txId}.txt`;a.click();}} className="flex-1 flex items-center justify-center gap-2 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-bold py-2.5 rounded-xl text-sm transition-all"><ArrowDownToLine size={13}/>Save Receipt</button>
          <button onClick={onClose} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-sm transition-all">Close</button>
        </div>
      </div>
    </div>
  );
}

function OrderSummary({purchaseType,nodeName,gpu,vram,itype,paymentModel,contractLabel,contractMonths,price,licenseType,effectivePrice,cryptoDiscount,payMethod,miningPeriod}:{purchaseType:PurchaseType;nodeName:string;gpu:string;vram:string;itype:string;paymentModel:string;contractLabel:string;contractMonths:number;price:number;licenseType:string;effectivePrice:number;cryptoDiscount:number;payMethod:PayMethod;miningPeriod:string;}){
  const isContract=paymentModel==="contract";
  const contractDurLabel=contractMonths===6?"6 months":contractMonths===12?"12 months":`${contractMonths} months`;
  const licConfig=LICENSE_CONFIGS[licenseType]??LICENSE_CONFIGS.operator_license;
  const LicIcon=licConfig.icon;
  const periodLabel=PERIOD_LABELS[miningPeriod]??miningPeriod;
  return(
    <div>
      <div className="text-2xl font-black text-white mb-6">Order Summary</div>
      {purchaseType==="gpu_plan"&&(
        <div className="rounded-2xl p-6 mb-4" style={{background:"rgba(22,28,36,0.95)",border:"1px solid rgba(255,255,255,0.08)"}}>
          <div className="space-y-4">
            {[["Plan",nodeName],["GPU",gpu],["VRAM",vram],["Payment Model",isContract?"Contract-Based":"Pay-As-You-Go (Flexible)"],...(!isContract?[["Mining Duration",periodLabel],["Earnings","Live — visible in your portfolio"]]:[["Contract Term",contractDurLabel],["Earnings","Accumulate daily"]])].map(([l,v])=>(
              <div key={l} className="flex justify-between items-start"><span className="text-slate-400 text-sm">{l}</span><span className="text-white font-semibold text-right max-w-[55%] text-sm">{v}</span></div>
            ))}
          </div>
          <div className="border-t border-slate-700 my-4"/>
          {payMethod==="crypto_wallet"&&<div className="mb-3 p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg"><p className="text-violet-200 text-sm"><strong>Crypto Discount:</strong> {cryptoDiscount}% off</p></div>}
          <div className="flex justify-between items-center"><span className="text-slate-400 text-sm">Total Investment</span><span className="text-2xl font-black text-emerald-400">${effectivePrice.toFixed(2)}</span></div>
        </div>
      )}
      {purchaseType==="license"&&(
        <div className="rounded-2xl p-6 mb-4" style={{background:"rgba(22,28,36,0.95)",border:"1px solid rgba(255,255,255,0.08)"}}>
          <div className="flex items-start gap-4 mb-5 pb-5 border-b border-slate-700">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{background:`${licConfig.color}18`,border:`1px solid ${licConfig.color}40`}}><LicIcon size={22} style={{color:licConfig.color}}/></div>
            <div><p className="text-white font-black text-sm">{licConfig.label}</p><p className="text-slate-500 text-xs mt-1">Certified AI Operator Program</p></div>
          </div>
          <div className="space-y-2.5 mb-5">{licConfig.features.map(f=><div key={f} className="flex items-center gap-2.5"><CheckCircle size={13} style={{color:licConfig.color}} className="shrink-0"/><span className="text-slate-300 text-sm">{f}</span></div>)}</div>
          <div className="border-t border-slate-700 my-4"/>
          {payMethod==="crypto_wallet"&&<div className="mb-3 p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg"><p className="text-violet-200 text-sm"><strong>Crypto Discount:</strong> {cryptoDiscount}% off</p></div>}
          <div className="flex justify-between items-center"><span className="text-slate-400 text-sm">Due Today</span><span className="text-2xl font-black text-amber-400">${effectivePrice.toFixed(2)}</span></div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

function CheckoutInner(){
  const router=useRouter();
  const params=useSearchParams();
  const[step,setStep]=useState<CheckoutStep>("country");
  const[userId,setUserId]=useState<string|undefined|null>(undefined);
  const[processingStep,setProcessingStep]=useState(0);
  const[errorMsg,setErrorMsg]=useState("");
  const[transactionId,setTransactionId]=useState("");
  const[showReceipt,setShowReceipt]=useState(false);
  const[allocationId,setAllocationId]=useState<string|null>(null);
  const[actualAmountPaid,setActualAmountPaid]=useState<number|null>(null);
  const[confirmedPayMethod,setConfirmedPayMethod]=useState<PayMethod>("bank_transfer");
  const[cryptoDiscount]=useState(5);
  const[cryptoWalletAddress,setCryptoWalletAddress]=useState("");
  const[cryptoNetwork]=useState("TRC-20 (TRON)");
  const[configLoaded,setConfigLoaded]=useState(false);
  const[countryCode,setCountryCode]=useState("");
  const[countryName,setCountryName]=useState("");
  const[payMethod,setPayMethod]=useState<PayMethod>("crypto_wallet");
  const[countrySearch,setCountrySearch]=useState("");
  const[kpLoading,setKpLoading]=useState(false);
  const[kpError,setKpError]=useState("");
  const[twSenderAddress,setTwSenderAddress]=useState("");
  const[twConfirmed,setTwConfirmed]=useState(false);
  const[cryptoError,setCryptoError]=useState("");
  const[bankTransferBlocked,setBankTransferBlocked]=useState(false);
  const[dailyLimitChecked,setDailyLimitChecked]=useState(false);
  const[splitState,setSplitState]=useState<SplitState|null>(null);
  const[splitLoading,setSplitLoading]=useState(false);
  const[splitError,setSplitError]=useState("");
  const[autoReinvest,setAutoReinvest]=useState(false);
  const isSubmittingRef=useRef(false);

  const rawPurchaseType=params.get("purchaseType");
  const nodeKey=params.get("node")||"foundation";
  const isApiAccess=nodeKey==="api_access"||rawPurchaseType==="api_access";
  const purchaseType:PurchaseType=rawPurchaseType?(rawPurchaseType as PurchaseType):nodeKey==="operator_license"||nodeKey.includes("license")||nodeKey.includes("optimization")||nodeKey.includes("rlhf")||nodeKey.includes("allocation")?"license":"gpu_plan";
  const nodeName=params.get("name")||"Foundation Node";
  const price=parseFloat(params.get("price")||"5");
  const itype=params.get("itype")||"on_demand";
  const gpu=params.get("gpu")||"Shared Pool (NVIDIA T4)";
  const vram=params.get("vram")||"16 GB GDDR6";
  const paymentModel=(params.get("paymentModel")||"flexible") as "flexible"|"contract";
  const isContract=paymentModel==="contract";
  const miningPeriod=params.get("miningPeriod")??(isApiAccess?"lifetime":"daily");
  const contractMonths=parseInt(params.get("contractMonths")||"6");
  const contractLabel=params.get("contractLabel")||"6 Months";
  const contractMinPct=parseFloat(params.get("contractMinPct")||"52");
  const contractMaxPct=parseFloat(params.get("contractMaxPct")||"93");
  const lockInMonths=parseInt(params.get("lockInMonths")||"0");
  const lockInLabel=params.get("lockInLabel")||(isContract?contractLabel:"Flexible");
  const lockInMultiplier=parseFloat(params.get("lockInMultiplier")||"1");
  const licenseType=isApiAccess?"api_access":params.get("licenseType")||params.get("type")||nodeKey||"operator_license";
  const discountedPrice=+(price*(1-cryptoDiscount/100)).toFixed(2);
  const effectivePrice=payMethod==="crypto_wallet"?discountedPrice:price;
  const periodLabel=PERIOD_LABELS[miningPeriod]??miningPeriod;

  useEffect(()=>{
    const hasRedirect=typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("status");
    if(!hasRedirect){sessionStorage.removeItem("korapay_split_checkout");sessionStorage.removeItem("korapay_pending_checkout");}
  },[]);

  // [FIX-LOADING-1] Auth + config in PARALLEL — was sequential causing 3-8s blank screen
  // [FIX-LOADING-2] fetchWithTimeout(5000) — config was hanging forever with no timeout
  // [FIX-LOADING-3] Daily limit in background — never blocks render
  useEffect(()=>{
    let cancelled=false;
    // Auth — fires immediately, page already shows spinner
    supabase.auth.getUser().then(({data:{user}}:{data:{user:User|null}})=>{
      if(cancelled)return;
      if(!user){router.push("/auth/signin");return;}
      setUserId(user.id);
    });
    // Config — parallel, 5s timeout, graceful fallback
    fetchWithTimeout("/api/checkout/payment-config",5000).then(r=>r.json()).then(data=>{
      if(cancelled)return;
      if(data.crypto_wallet_address)setCryptoWalletAddress(data.crypto_wallet_address);
      if(data.usd_to_ngn_rate&&!isNaN(Number(data.usd_to_ngn_rate)))CURRENCY_RATES["NG"]={currency:"NGN",rate:Number(data.usd_to_ngn_rate)};
      setConfigLoaded(true);
    }).catch(()=>{if(!cancelled)setConfigLoaded(true);});
    // Daily limit — fully background, never blocks UI
    Promise.all([getDailyBankTransferNGNTotal(),getTotalDailyCapacity()]).then(([total,cap])=>{
      if(!cancelled){if(total>=cap)setBankTransferBlocked(true);setDailyLimitChecked(true);}
    }).catch(()=>{if(!cancelled)setDailyLimitChecked(true);});
    return()=>{cancelled=true;};
  },[]);// eslint-disable-line

  // KoraPay redirect handler
  useEffect(()=>{
    const s=params.get("status");const r=params.get("reference");
    if(!s||!r)return;
    const splitSaved=sessionStorage.getItem("korapay_split_checkout");
    if(splitSaved){
      if(s==="success"){
        window.history.replaceState({},"","/dashboard/checkout");
        try{
          const saved:SplitState=JSON.parse(splitSaved);
          if(saved.planData.countryCode){setCountryCode(saved.planData.countryCode);setCountryName(saved.planData.countryName||"");}
          const updated:SplitState={...saved,completed:saved.completed+1,references:[...saved.references,r]};
          if(updated.completed>=updated.installmentsNGN.length){
            sessionStorage.removeItem("korapay_split_checkout");
            setTransactionId(r);setActualAmountPaid(updated.totalUSD);setConfirmedPayMethod("bank_transfer");
            supabase.auth.getUser().then(async({data:{user}}:{data:{user:User|null}})=>{if(!user)return;try{const id=await createMiningAllocation({...updated.planData,userId:user.id,transactionRef:updated.references.join(",")} as any);if(id)setAllocationId(id);}catch{}});
            setStep("success");
          }else{sessionStorage.setItem("korapay_split_checkout",JSON.stringify(updated));setSplitState(updated);setStep("details");}
        }catch{sessionStorage.removeItem("korapay_split_checkout");setStep("failed");setErrorMsg("Payment session error. Please contact support.");}
      }else if(s==="declined"){
        // [FIX-DECLINED] Poll before showing declined
        sessionStorage.removeItem("korapay_split_checkout");
        window.history.replaceState({},"","/dashboard/checkout");
        setTransactionId(r);setStep("verifying");
        pollForPaymentConfirmation(r).then(confirmed=>setStep(confirmed?"success":"declined"));
      }
      return;
    }
    if(s==="success"){
      setTransactionId(r);setStep("success");
      window.history.replaceState({},"","/dashboard/checkout");
      const saved=sessionStorage.getItem("korapay_pending_checkout");
      if(saved){
        sessionStorage.removeItem("korapay_pending_checkout");
        try{
          const cd=JSON.parse(saved);
          setActualAmountPaid(cd.originalPrice??cd.amount??price);setConfirmedPayMethod("bank_transfer");
          if(cd.countryCode){setCountryCode(cd.countryCode);setCountryName(cd.countryName||"");}
          supabase.auth.getUser().then(async({data:{user}}:{data:{user:User|null}})=>{if(!user)return;try{const id=await createMiningAllocation({...cd,userId:user.id,transactionRef:r} as any);if(id)setAllocationId(id);}catch{}});
        }catch{}
      }
    }else if(s==="declined"){
      // [FIX-DECLINED] Don't immediately show declined — poll DB first
      window.history.replaceState({},"","/dashboard/checkout");
      setTransactionId(r);
      let savedData:any=null;
      const saved=sessionStorage.getItem("korapay_pending_checkout");
      if(saved){try{savedData=JSON.parse(saved);if(savedData.countryCode){setCountryCode(savedData.countryCode);setCountryName(savedData.countryName||"");}setActualAmountPaid(savedData.originalPrice??savedData.amount??price);}catch{}}
      setStep("verifying");
      pollForPaymentConfirmation(r).then(confirmed=>{
        if(confirmed){
          if(savedData){sessionStorage.removeItem("korapay_pending_checkout");setActualAmountPaid(savedData.originalPrice??savedData.amount??price);setConfirmedPayMethod("bank_transfer");supabase.auth.getUser().then(async({data:{user}}:{data:{user:User|null}})=>{if(!user)return;try{const id=await createMiningAllocation({...savedData,userId:user.id,transactionRef:r} as any);if(id)setAllocationId(id);}catch{}});}
          setStep("success");
        }else{sessionStorage.removeItem("korapay_pending_checkout");setStep("declined");}
      });
    }
  },[params]);// eslint-disable-line

  useEffect(()=>{if(!countryCode)return;setPayMethod(BANK_TRANSFER_COUNTRIES.has(countryCode)?"bank_transfer":"crypto_wallet");},[countryCode]);

  async function initiateSplitInstallment(state:SplitState){
    if(!userId)return;setSplitLoading(true);setSplitError("");
    const installmentNGN=state.installmentsNGN[state.completed];
    try{
      sessionStorage.setItem("korapay_split_checkout",JSON.stringify(state));
      const res=await fetch("/api/korapay/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,phone:"",nodeKey:state.planData.nodeKey||nodeKey,nodeName:state.planData.nodeName||nodeName,price:installmentNGN,originalPrice:parseFloat((installmentNGN/state.ngnRate).toFixed(2)),currency:state.localCurrency,itype:state.planData.itype||itype,gpu:state.planData.gpuModel||gpu,vram:state.planData.vram||vram,purchaseType,licenseType,paymentModel,miningPeriod:state.planData.miningPeriod||miningPeriod,contractMonths:state.planData.contractMonths||contractMonths,contractLabel:state.planData.contractLabel||contractLabel,contractMinPct:state.planData.contractMinPct||contractMinPct,contractMaxPct:state.planData.contractMaxPct||contractMaxPct,lockInMonths:state.planData.lockInMonths||lockInMonths,lockInMultiplier:state.planData.lockInMultiplier||lockInMultiplier,lockInLabel:state.planData.lockInLabel||lockInLabel,countryCode:state.planData.countryCode||countryCode,countryName:state.planData.countryName||countryName,isSplitPayment:true,splitInstallment:state.completed+1,splitTotal:state.installmentsNGN.length})});
      const data=await res.json();
      if(!res.ok||!data.checkoutUrl){sessionStorage.removeItem("korapay_split_checkout");setSplitError(data.error||"Payment initiation failed.");setSplitLoading(false);return;}
      window.location.href=data.checkoutUrl;
    }catch{sessionStorage.removeItem("korapay_split_checkout");setSplitError("Connection error. Please try again.");setSplitLoading(false);}
  }

  async function handleBankTransferSubmit(){
    if(!userId){setKpError("Session not ready.");return;}
    setKpError("");setKpLoading(true);
    const[currentNGNTotal,totalCapacity]=await Promise.all([getDailyBankTransferNGNTotal(),getTotalDailyCapacity()]);
    if(currentNGNTotal>=totalCapacity){setBankTransferBlocked(true);setKpError("Bank transfer capacity reached. Please use Crypto or Card.");setKpLoading(false);return;}
    const conversion=CURRENCY_RATES[countryCode];
    const localCurrency=conversion?.currency??"NGN";
    const convertedPrice=conversion?parseFloat((price*conversion.rate).toFixed(2)):price;
    if(convertedPrice>MAX_SINGLE_NGN_TXN){
      const installmentsNGN=computeInstallments(convertedPrice);
      setSplitState({totalNGN:convertedPrice,totalUSD:price,ngnRate:conversion?.rate??1600,localCurrency,installmentsNGN,completed:0,references:[],kpPhone:"",planData:{planId:nodeKey,planName:nodeName,amount:price,paymentModel,instanceType:itype,gpuModel:gpu,vram,miningPeriod,contractMonths,contractLabel,contractMinPct,contractMaxPct,lockInMonths:isContract?contractMonths:lockInMonths,lockInLabel:isContract?contractLabel:lockInLabel,lockInMultiplier,countryCode,countryName,autoReinvest,nodeKey,nodeName,itype,purchaseType,licenseType,originalPrice:price}});
      setKpLoading(false);return;
    }
    try{
      sessionStorage.setItem("korapay_pending_checkout",JSON.stringify({planId:nodeKey,planName:nodeName,amount:price,originalPrice:price,paymentModel,instanceType:itype,gpuModel:gpu,vram,miningPeriod,contractMonths,contractLabel,contractMinPct,contractMaxPct,lockInMonths:isContract?contractMonths:lockInMonths,lockInLabel:isContract?contractLabel:lockInLabel,lockInMultiplier,countryCode,countryName,autoReinvest}));
      const res=await fetch("/api/korapay/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,phone:"",nodeKey,nodeName,price:convertedPrice,originalPrice:price,currency:localCurrency,itype,gpu,vram,purchaseType,licenseType,paymentModel,miningPeriod,contractMonths,contractLabel,contractMinPct,contractMaxPct,lockInMonths:isContract?contractMonths:lockInMonths,lockInMultiplier,lockInLabel:isContract?contractLabel:lockInLabel,countryCode,countryName})});
      const data=await res.json();
      if(!res.ok||!data.checkoutUrl){sessionStorage.removeItem("korapay_pending_checkout");if(data.code==="ALL_ACCOUNTS_FULL")setBankTransferBlocked(true);setKpError(data.error||"Payment initiation failed.");setKpLoading(false);return;}
      window.location.href=data.checkoutUrl;
    }catch{sessionStorage.removeItem("korapay_pending_checkout");setKpError("Connection error. Please try again.");setKpLoading(false);}
  }

  async function handleSubmit(e:React.FormEvent){
    e.preventDefault();
    if(!userId){setErrorMsg("Session not ready.");return;}
    if(isSubmittingRef.current)return;
    if(payMethod==="bank_transfer"){await handleBankTransferSubmit();return;}
    if(payMethod==="crypto_wallet"){
      setCryptoError("");
      if(!twConfirmed){setCryptoError("Please confirm you will send the payment.");return;}
      if(!cryptoWalletAddress){setCryptoError("Payment wallet not configured. Contact support.");return;}
    }
    isSubmittingRef.current=true;setStep("processing");setProcessingStep(0);
    if(payMethod==="crypto_wallet"){
      setProcessingStep(1);await new Promise(r=>setTimeout(r,1200));
      setProcessingStep(2);await new Promise(r=>setTimeout(r,800));
      try{
        const txId=`CRYPTO-${Date.now()}`;
        const{error:insertErr}=await supabase.from("payment_transactions").insert({user_id:userId,node_key:nodeKey,amount:discountedPrice,currency:"USDT",gateway:"crypto",status:"pending",gateway_reference:txId,crypto_wallet:twSenderAddress||null,crypto_network:cryptoNetwork,crypto_currency:"USDT",verified_by_admin:false,metadata:JSON.stringify({purchaseType,licenseType,nodeName,gpu,vram,originalAmount:price,discountPercent:cryptoDiscount,paymentModel,miningPeriod,contractMonths,contractLabel,contractMinPct,contractMaxPct,lockInMonths:isContract?contractMonths:lockInMonths,lockInLabel:isContract?contractLabel:lockInLabel,countryCode,countryName,autoReinvest})});
        if(insertErr)throw insertErr;
        setTransactionId(txId);setActualAmountPaid(discountedPrice);setConfirmedPayMethod("crypto_wallet");
        setStep("pending_crypto");isSubmittingRef.current=false;
      }catch(err:any){setErrorMsg(err?.message||"Failed to submit payment.");setStep("failed");isSubmittingRef.current=false;}
      return;
    }
    let cur=0;
    for(const ps of PROCESSING_STEPS){setProcessingStep(cur);await new Promise(r=>setTimeout(r,ps.ms));cur++;}
    try{
      const res=await fetch("/api/checkout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,nodeKey,amount:price,currency:"USD",itype,payMethod,countryCode,gateway:"card",purchaseType,licenseType,paymentModel,miningPeriod,contractMonths,contractLabel,contractMinPct,contractMaxPct,lockInMonths:isContract?contractMonths:lockInMonths,lockInMultiplier,lockInLabel:isContract?contractLabel:lockInLabel,autoReinvest})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||"Payment failed");
      const id=await createMiningAllocation({userId,planId:nodeKey,planName:nodeName,amount:price,paymentModel,instanceType:itype,gpuModel:gpu,vram,miningPeriod,contractMonths,contractLabel,contractMinPct,contractMaxPct,lockInMonths:isContract?contractMonths:lockInMonths,lockInLabel:isContract?contractLabel:lockInLabel,lockInMultiplier,transactionRef:data.transactionId,autoReinvest});
      if(id)setAllocationId(id);
      setTransactionId(data.transactionId||`TXN-${Date.now()}`);setActualAmountPaid(price);setConfirmedPayMethod("card");
      setStep("success");isSubmittingRef.current=false;
    }catch(err:any){setErrorMsg(err?.message||"Payment could not be processed.");setStep("failed");isSubmittingRef.current=false;}
  }

  const receiptData={txId:transactionId,purchaseType:(isApiAccess?"api_access":purchaseType) as PurchaseType|"api_access",nodeName,amount:actualAmountPaid??effectivePrice,gpu,vram,paymentModel,contractLabel,contractMonths,licenseType,miningPeriod,payMethod:confirmedPayMethod==="bank_transfer"?"Bank / Mobile Transfer":confirmedPayMethod==="crypto_wallet"?"Crypto Payment (USDT)":"Credit / Debit Card",country:countryName,date:new Date().toLocaleString("en-US",{dateStyle:"long",timeStyle:"short"}),discounted:confirmedPayMethod==="crypto_wallet",walletAddress:confirmedPayMethod==="crypto_wallet"?twSenderAddress:undefined};
  const filteredCountries=COUNTRIES.filter(c=>c.name.toLowerCase().includes(countrySearch.toLowerCase()));
  const conversionInfo=CURRENCY_RATES[countryCode];
  const localAmount=conversionInfo?Math.round(price*conversionInfo.rate):null;

  if(userId===undefined)return(
    <div className="min-h-screen flex items-center justify-center" style={{background:"#0d1117"}}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-t-emerald-400 border-slate-700 rounded-full animate-spin"/>
        <p className="text-slate-400 text-sm">Loading secure checkout…</p>
      </div>
    </div>
  );

  return(
    <div className="min-h-screen py-8 px-4" style={{background:"#0d1117"}}>
      {showReceipt&&<Receipt data={receiptData} onClose={()=>setShowReceipt(false)}/>}
      {splitState!==null&&step==="details"&&<SplitPaymentModal state={splitState} loading={splitLoading} error={splitError} onInitiate={initiateSplitInstallment} onCancel={()=>{sessionStorage.removeItem("korapay_split_checkout");setSplitState(null);setSplitError("");setPayMethod("crypto_wallet");}}/>}

      <div className="max-w-[960px] mx-auto mb-6">
        <button onClick={()=>step==="details"?setStep("country"):router.back()} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors text-sm"><ArrowLeft size={14}/>Back</button>
      </div>

      {/* VERIFYING — FIX-DECLINED polling screen */}
      {step==="verifying"&&(
        <div className="max-w-[520px] mx-auto">
          <div className="rounded-3xl p-8 text-center" style={{background:"rgba(22,28,36,0.95)",border:"1px solid rgba(255,255,255,0.08)"}}>
            <Loader2 size={36} className="text-emerald-400 mx-auto mb-5 animate-spin"/>
            <h2 className="text-white font-black text-2xl mb-2">Verifying Payment…</h2>
            <p className="text-slate-400 text-sm leading-relaxed">Your bank processed the payment. Confirming with our payment processor — usually takes a few seconds.</p>
            <p className="text-slate-600 text-xs mt-4">Please do not close or refresh this page.</p>
          </div>
        </div>
      )}

      {/* PENDING CRYPTO */}
      {step==="pending_crypto"&&(
        <div className="max-w-[560px] mx-auto">
          <div className="rounded-3xl p-8" style={{background:"rgba(22,28,36,0.95)",border:"1px solid rgba(139,92,246,0.3)"}}>
            <div className="w-16 h-16 rounded-full bg-violet-500/15 border-2 border-violet-500/40 flex items-center justify-center mx-auto mb-5"><Clock size={28} className="text-violet-400"/></div>
            <h2 className="text-white font-black text-2xl text-center mb-2">Payment Details Submitted</h2>
            <p className="text-slate-400 text-sm text-center mb-6">Send your USDT to the wallet below. We'll verify and <strong className="text-violet-300">activate your session within 30 minutes</strong>.</p>
            <div className="rounded-2xl p-5 mb-5 space-y-4" style={{background:"rgba(139,92,246,0.08)",border:"1px solid rgba(139,92,246,0.25)"}}>
              <p className="text-violet-300 text-xs font-black uppercase tracking-widest text-center">Send Payment To This Address</p>
              <div className="flex justify-center">{cryptoWalletAddress&&<QRCode value={cryptoWalletAddress} size={160}/>}</div>
              <div className="rounded-xl p-3" style={{background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.08)"}}>
                <div className="flex items-center gap-2"><p className="text-white font-mono text-xs break-all flex-1 select-all">{cryptoWalletAddress||"Loading…"}</p>{cryptoWalletAddress&&<CopyButton text={cryptoWalletAddress}/>}</div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[["Amount to Send",`${discountedPrice.toFixed(2)} USDT`],["Network",cryptoNetwork],["Currency","USDT (Tether)"],["Transaction Ref",transactionId.slice(-12)+"…"]].map(([l,v])=>(
                  <div key={l} className="rounded-lg p-2.5" style={{background:"rgba(0,0,0,0.3)"}}><p className="text-slate-500 text-[10px] mb-0.5">{l}</p><p className="text-white font-bold text-xs break-all">{v}</p></div>
                ))}
              </div>
            </div>
            <div className="rounded-xl p-3 mb-5" style={{background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.2)"}}><p className="text-amber-400 text-xs"><strong>Important:</strong> Send exactly <strong>{discountedPrice.toFixed(2)} USDT</strong> on <strong>{cryptoNetwork}</strong> only. Wrong network = lost funds.</p></div>
            <button onClick={()=>router.push("/dashboard")} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 rounded-xl transition-all">I've Sent the Payment — Return to Dashboard</button>
          </div>
        </div>
      )}

      {/* DECLINED */}
      {step==="declined"&&(
        <div className="max-w-[520px] mx-auto">
          <div className="rounded-3xl p-8" style={{background:"rgba(22,28,36,0.95)",border:"1px solid rgba(255,255,255,0.08)"}}>
            <div className="w-16 h-16 rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center mx-auto mb-5"><AlertCircle size={28} className="text-red-400"/></div>
            <h2 className="text-white font-black text-2xl text-center mb-2">Payment Declined</h2>
            <p className="text-slate-400 text-sm text-center mb-5">Your payment was declined or cancelled. Please try again.</p>
            <div className="flex gap-3">
              <button onClick={()=>setStep("details")} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg">Try Again</button>
              <button onClick={()=>router.back()} className="flex-1 border border-slate-700 text-slate-300 font-bold py-3 rounded-lg">Back</button>
            </div>
          </div>
        </div>
      )}

      {/* COUNTRY */}
      {step==="country"&&(
        <div className="max-w-[960px] mx-auto">
          <div className="text-center mb-8"><h1 className="text-3xl font-black text-white mb-2">Select Your Country</h1><p className="text-slate-400">Determines your available payment methods</p></div>
          <div className="rounded-2xl p-8" style={{background:"rgba(22,28,36,0.95)",border:"1px solid rgba(255,255,255,0.08)"}}>
            <div className="mb-6 relative"><Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input type="text" placeholder="Search countries…" value={countrySearch} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setCountrySearch(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-black/30 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none"/></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
              {filteredCountries.map(c=>(
                <button key={c.code} onClick={()=>{setCountryCode(c.code);setCountryName(c.name);}} className={`p-3 rounded-lg text-left transition-all border ${countryCode===c.code?"bg-emerald-600/20 border-emerald-500 text-emerald-100":"bg-black/20 border-slate-700 text-slate-300 hover:border-slate-600"}`}>
                  <div className="font-semibold text-sm">{c.name}</div><div className="text-xs opacity-70">{c.code}</div>
                </button>
              ))}
            </div>
            <button onClick={()=>countryCode&&setStep("details")} disabled={!countryCode} className={`w-full mt-6 py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${countryCode?"bg-emerald-600 hover:bg-emerald-500 text-white":"bg-slate-700 text-slate-400 cursor-not-allowed"}`}>Continue <ChevronRight size={16}/></button>
          </div>
        </div>
      )}

      {/* DETAILS */}
      {step==="details"&&(
        <div className="max-w-[960px] mx-auto">
          <div className="grid lg:grid-cols-[1fr_420px] gap-8">
            <OrderSummary purchaseType={purchaseType} nodeName={nodeName} gpu={gpu} vram={vram} itype={itype} paymentModel={paymentModel} contractLabel={contractLabel} contractMonths={contractMonths} price={price} licenseType={licenseType} effectivePrice={effectivePrice} cryptoDiscount={cryptoDiscount} payMethod={payMethod} miningPeriod={miningPeriod}/>
            <div className="space-y-5">
              <div><div className="text-xl font-bold text-white mb-1">Choose Payment Method</div><p className="text-slate-400 text-xs mb-4">Crypto offers faster processing &amp; exclusive discounts</p></div>
              {bankTransferBlocked&&dailyLimitChecked&&(
                <div className="rounded-xl p-4 flex items-start gap-3" style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.25)"}}>
                  <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5"/>
                  <div><p className="text-red-300 text-sm font-black">Bank Transfer Unavailable Today</p><p className="text-red-400/70 text-xs mt-0.5">Daily capacity reached. Resets at midnight. Use <strong className="text-red-300">Crypto</strong> or <strong className="text-red-300">Card</strong>.</p></div>
                </div>
              )}
              {(()=>{
                const methods=getPaymentMethodsForCountry(countryCode,price);
                return(
                  <div className="space-y-3">
                    <button type="button" onClick={()=>setPayMethod("crypto_wallet")} className={`w-full p-4 rounded-xl transition-all border-2 relative overflow-hidden ${payMethod==="crypto_wallet"?"bg-gradient-to-r from-violet-600/40 to-purple-600/40 border-violet-400":"bg-slate-800/50 border-slate-600 hover:border-violet-400/50"}`}>
                      <div className="absolute top-2 right-2 bg-violet-500 text-white text-[10px] font-black px-2 py-1 rounded">RECOMMENDED</div>
                      <div className="flex items-center gap-3"><div className="text-2xl">₿</div><div className="text-left flex-1"><div className="text-white font-bold text-sm">Crypto Payment (USDT)</div><div className="text-slate-400 text-xs">{cryptoDiscount}% discount · Instant · Secure</div></div><div className="text-emerald-400 font-bold text-sm">${discountedPrice.toFixed(2)}</div></div>
                    </button>
                    {methods.includes("card")&&(
                      <button type="button" onClick={()=>router.push(`/dashboard/checkout/card?${params.toString()}&miningPeriod=${miningPeriod}&autoReinvest=${autoReinvest}`)} className="w-full p-4 rounded-xl transition-all border-2 bg-slate-800/30 border-slate-700 hover:border-slate-500">
                        <div className="flex items-center gap-3"><div className="text-xl">💳</div><div className="text-left flex-1"><div className="text-slate-300 font-bold text-sm">Credit / Debit Card</div><div className="text-slate-500 text-xs">OTP Required · Verify with your bank</div></div><div className="text-slate-400 font-bold text-sm">${price.toFixed(2)}</div></div>
                      </button>
                    )}
                    {methods.includes("bank_transfer")&&(
                      <button type="button" onClick={()=>!bankTransferBlocked&&setPayMethod("bank_transfer")} disabled={bankTransferBlocked} className={`w-full p-4 rounded-xl transition-all border-2 ${bankTransferBlocked?"bg-slate-900/20 border-slate-800 opacity-50 cursor-not-allowed":payMethod==="bank_transfer"?"bg-blue-700/20 border-blue-400":"bg-slate-800/30 border-slate-700 hover:border-blue-500/50"}`}>
                        <div className="flex items-center gap-3"><div className="text-xl">🏦</div><div className="text-left flex-1"><div className="text-slate-300 font-bold text-sm">Local Transfer{bankTransferBlocked&&<span className="ml-2 text-[10px] font-black text-red-400 bg-red-900/20 border border-red-800/30 px-1.5 py-0.5 rounded-full">LIMIT REACHED</span>}</div><div className="text-slate-500 text-xs">{bankTransferBlocked?"Unavailable — resets at midnight":"Bank · Card · Mobile Money"}</div></div><div className="text-slate-400 font-bold text-sm">${price.toFixed(2)}</div></div>
                      </button>
                    )}
                  </div>
                );
              })()}
              {purchaseType==="gpu_plan"&&(
                <div className="rounded-xl p-4" style={{background:"rgba(16,185,129,0.05)",border:"1px solid rgba(16,185,129,0.2)"}}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <div onClick={()=>setAutoReinvest(v=>!v)} className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${autoReinvest?"bg-emerald-500 border-emerald-500":"border-slate-600"}`}>{autoReinvest&&<Check size={12} className="text-white"/>}</div>
                    <div><p className="text-emerald-300 text-sm font-bold flex items-center gap-1.5"><RefreshCw size={12}/>Auto-Reinvest After Session Ends</p><p className="text-slate-500 text-xs mt-0.5">Automatically restart a new {periodLabel} session when this one completes.</p></div>
                  </label>
                </div>
              )}
              <form onSubmit={handleSubmit}>
                {payMethod==="bank_transfer"&&!bankTransferBlocked&&(
                  <div className="rounded-2xl p-6 space-y-4" style={{background:"rgba(22,28,36,0.95)",border:"1px solid rgba(59,130,246,0.25)"}}>
                    {localAmount&&localAmount>MAX_SINGLE_NGN_TXN&&(
                      <div className="p-3 rounded-xl flex items-start gap-2.5" style={{background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.25)"}}>
                        <Landmark size={13} className="text-amber-400 mt-0.5 shrink-0"/>
                        <div><p className="text-amber-300 text-xs font-black">Installment Payment Required</p><p className="text-amber-400/70 text-xs mt-0.5">₦{localAmount.toLocaleString()} exceeds ₦200,000 limit. Will split into <strong className="text-amber-200">{computeInstallments(localAmount).length} installments</strong>.</p></div>
                      </div>
                    )}
                    <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg"><p className="text-blue-200 text-xs">You'll be redirected to complete payment via bank transfer, card, or mobile money.</p></div>
                    {localAmount&&conversionInfo&&<div className="p-3 rounded-lg" style={{background:"rgba(16,185,129,0.07)",border:"1px solid rgba(16,185,129,0.2)"}}><p className="text-emerald-300 text-xs">Approx. amount: <strong className="text-emerald-200">{conversionInfo.currency} {localAmount.toLocaleString()}</strong></p></div>}
                    {kpError&&<div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2"><AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5"/><p className="text-red-300 text-xs">{kpError}</p></div>}
                    <button type="submit" disabled={kpLoading} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all">
                      {kpLoading?<><Loader2 size={16} className="animate-spin"/>Connecting…</>:localAmount&&localAmount>MAX_SINGLE_NGN_TXN?<><Landmark size={14}/>Set Up Installment Payment</>:<><Lock size={14}/>Proceed to Secure Payment</>}
                    </button>
                  </div>
                )}
                {payMethod==="crypto_wallet"&&(
                  <div className="rounded-2xl p-6 space-y-5" style={{background:"rgba(22,28,36,0.95)",border:"1px solid rgba(139,92,246,0.25)"}}>
                    <div><p className="text-violet-300 font-black text-sm mb-1">Pay with USDT</p><p className="text-slate-500 text-xs">Scan QR or copy address, then send exact amount.</p></div>
                    {!configLoaded?<div className="flex justify-center py-4"><Loader2 size={24} className="text-violet-400 animate-spin"/></div>
                      :!cryptoWalletAddress?<div className="rounded-xl p-4 text-center" style={{background:"rgba(244,63,94,0.08)",border:"1px solid rgba(244,63,94,0.2)"}}><p className="text-rose-400 text-xs font-bold">Crypto payment not currently available</p><p className="text-rose-400/70 text-xs mt-1">Please use card or bank transfer.</p></div>
                      :<div className="rounded-xl p-4 space-y-4" style={{background:"rgba(139,92,246,0.06)",border:"1px solid rgba(139,92,246,0.2)"}}>
                        <div className="flex justify-center"><QRCode value={cryptoWalletAddress} size={144}/></div>
                        <p className="text-center text-slate-400 text-xs">Scan with your crypto wallet app</p>
                        <div className="flex items-center gap-2 rounded-lg p-3" style={{background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.08)"}}><p className="text-white font-mono text-xs break-all flex-1 select-all">{cryptoWalletAddress}</p><CopyButton text={cryptoWalletAddress}/></div>
                        <div className="grid grid-cols-2 gap-2">
                          {[["Exact Amount",`${discountedPrice.toFixed(2)} USDT`],["Network",cryptoNetwork]].map(([l,v])=>(
                            <div key={l} className="rounded-lg p-2.5" style={{background:"rgba(0,0,0,0.3)"}}><p className="text-slate-500 text-[10px] mb-0.5">{l}</p><p className="text-emerald-400 font-black text-sm">{v}</p></div>
                          ))}
                        </div>
                      </div>}
                    <div><label className="block text-white text-sm font-bold mb-1.5">Your Wallet Address <span className="text-slate-500 font-normal text-xs">(optional)</span></label><input type="text" placeholder="Paste your sending wallet address" value={twSenderAddress} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setTwSenderAddress(e.target.value)} className="w-full px-4 py-3 bg-black/30 border border-slate-700 rounded-lg text-white placeholder-slate-500 font-mono text-xs focus:outline-none focus:border-violet-500"/></div>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <div onClick={()=>setTwConfirmed(v=>!v)} className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${twConfirmed?"bg-violet-500 border-violet-500":"border-slate-600"}`}>{twConfirmed&&<Check size={12} className="text-white"/>}</div>
                      <p className="text-slate-300 text-xs leading-relaxed">I understand I must send exactly <strong className="text-white">{discountedPrice.toFixed(2)} USDT</strong> on the <strong className="text-white">{cryptoNetwork}</strong> network.</p>
                    </label>
                    {cryptoError&&<div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2"><AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5"/><p className="text-red-300 text-xs">{cryptoError}</p></div>}
                    <button type="submit" disabled={!twConfirmed||!cryptoWalletAddress} className="w-full py-3 rounded-lg font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed text-white" style={{background:twConfirmed&&cryptoWalletAddress?"linear-gradient(135deg,#8b5cf6,#6d28d9)":"rgba(139,92,246,0.3)"}}>Submit Payment Details</button>
                  </div>
                )}
              </form>
              <div className="rounded-xl p-4" style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)"}}>
                <div className="flex justify-between items-center"><span className="text-slate-400 text-sm">You pay</span><div className="text-right"><span className="text-white font-black text-xl">${effectivePrice.toFixed(2)}</span>{payMethod==="crypto_wallet"&&<p className="text-emerald-400 text-[10px]">-{cryptoDiscount}% crypto discount</p>}</div></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PROCESSING */}
      {step==="processing"&&(
        <div className="max-w-[520px] mx-auto">
          <div className="rounded-3xl p-8 text-center" style={{background:"rgba(22,28,36,0.95)",border:"1px solid rgba(255,255,255,0.08)"}}>
            <Loader2 size={32} className="text-emerald-400 mx-auto mb-4 animate-spin"/>
            <h2 className="text-white font-black text-2xl mb-2">Processing Payment</h2>
            <p className="text-slate-400 text-sm mb-6">{PROCESSING_STEPS[processingStep]?.label||"Completing…"}</p>
            <div className="space-y-3">
              {PROCESSING_STEPS.map((ps,idx)=>(
                <div key={ps.id} className={`flex items-center gap-3 text-sm ${idx<=processingStep?"text-emerald-300":"text-slate-600"}`}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${idx<processingStep?"bg-emerald-500 border-emerald-500":idx===processingStep?"border-emerald-500 animate-pulse":"border-slate-600"}`}>{idx<processingStep&&<CheckCircle size={14} className="text-white"/>}</div>
                  <span>{ps.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS */}
      {step==="success"&&(
        <div className="max-w-[520px] mx-auto">
          <div className="rounded-3xl p-8" style={{background:"rgba(22,28,36,0.95)",border:"1px solid rgba(255,255,255,0.08)"}}>
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-5"><CheckCircle size={32} className="text-emerald-400"/></div>
            <h2 className="text-white font-black text-2xl text-center mb-2">{isApiAccess?"API Access Activated!":purchaseType==="license"?"License Activated!":"Mining Session Started!"}</h2>
            <p className="text-slate-400 text-sm text-center mb-6">{isApiAccess?"Your API developer access is now active.":purchaseType==="license"?"Your operator license is now active.":isContract?"Your GPU node contract is active. Earnings accrue daily.":`Your ${periodLabel} mining session is live.`}</p>
            <div className="rounded-xl p-4 mb-6 space-y-3 text-sm" style={{background:"rgba(0,0,0,0.35)",border:"1px solid rgba(255,255,255,0.06)"}}>
              {[["Transaction ID",transactionId],["Amount Paid",`$${(actualAmountPaid??effectivePrice).toFixed(2)}`],...(!isContract&&purchaseType==="gpu_plan"?[["Mining Duration",periodLabel]]:[]),["Country",countryName]].map(([l,v])=>(
                <div key={l} className="flex justify-between"><span className="text-slate-500">{l}</span><span className="text-white font-semibold">{v}</span></div>
              ))}
              {autoReinvest&&!isApiAccess&&<div className="flex justify-between"><span className="text-slate-500">Auto-Reinvest</span><span className="text-emerald-400 font-semibold flex items-center gap-1"><RefreshCw size={11}/>Enabled</span></div>}
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setShowReceipt(true)} className="flex-1 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-bold py-3 rounded-lg transition-all">View Receipt</button>
              <button onClick={()=>router.push(isApiAccess?"/dashboard/api-access":purchaseType==="license"?"/dashboard/tasks":"/dashboard/gpu-plans")} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-all">{isApiAccess?"Go to API Access →":purchaseType==="license"?"Go to Tasks":"View Portfolio →"}</button>
            </div>
          </div>
        </div>
      )}

      {/* FAILED */}
      {step==="failed"&&(
        <div className="max-w-[520px] mx-auto">
          <div className="rounded-3xl p-8" style={{background:"rgba(22,28,36,0.95)",border:"1px solid rgba(255,255,255,0.08)"}}>
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center mx-auto mb-5"><AlertCircle size={32} className="text-red-400"/></div>
            <h2 className="text-white font-black text-2xl text-center mb-2">Payment Failed</h2>
            <p className="text-slate-400 text-sm text-center mb-4">{errorMsg||"Something went wrong. Please try again."}</p>
            <div className="flex gap-3">
              <button onClick={()=>{setErrorMsg("");isSubmittingRef.current=false;setStep("details");}} className="flex-1 border border-slate-700 hover:border-slate-500 text-slate-300 font-bold py-3 rounded-lg transition-all">Try Again</button>
              <button onClick={()=>router.back()} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg transition-all">Back</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckoutPage(){
  return(
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{background:"#0d1117"}}><div className="w-10 h-10 border-2 border-t-emerald-400 border-slate-700 rounded-full animate-spin"/></div>}>
      <CheckoutInner/>
    </Suspense>
  );
}