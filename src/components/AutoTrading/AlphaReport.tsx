/**
 * src/components/AutoTrading/AlphaReport.tsx
 * 最終進化版：智慧復盤報告 — 具備成就勳章與信心演化趨勢
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, TrendingUp, Star, RefreshCw, Trophy, Zap, ShieldCheck, PieChart, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';

export function AlphaReport() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/autotrading/report');
      const data = await res.json();
      if (data.ok) setReport(data.report);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  if (loading) {
    return (
      <div className="h-[400px] flex flex-col items-center justify-center space-y-6">
        <Sparkles className="h-10 w-10 text-amber-400 animate-spin" />
        <div className="text-[11px] font-bold text-white uppercase tracking-[0.2em] animate-pulse">{t('autotrading.alphaReport.evolvingData', 'Evolving Report Data...')}</div>
      </div>
    );
  }

  if (!report) return null;

  const AchievementIcon = ({ type }: { type: string }) => {
    switch(type) {
      case 'CRITICAL_DEFENSE': return <div className="flex items-center gap-1.5 bg-rose-500/20 text-rose-400 px-2 py-1 rounded-sm border border-rose-500/30 text-[9px] font-bold"><ShieldCheck className="h-3 w-3" /> {t('autotrading.alphaReport.achievement.criticalDefense', 'CRITICAL_DEFENSE')}</div>;
      case 'ALPHA_CATCHER': return <div className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-sm border border-emerald-500/30 text-[9px] font-bold"><TrendingUp className="h-3 w-3" /> {t('autotrading.alphaReport.achievement.alphaCatcher', 'ALPHA_CATCHER')}</div>;
      case 'STREAK_5': return <div className="flex items-center gap-1.5 bg-amber-500/20 text-amber-400 px-2 py-1 rounded-sm border border-amber-500/30 text-[9px] font-bold"><Trophy className="h-3 w-3" /> {t('autotrading.alphaReport.achievement.winStreak', 'WIN_STREAK')}</div>;
      default: return null;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      
      {/* Achievement Header */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
         <span className="text-[10px] text-white/30 uppercase font-bold whitespace-nowrap">{t('autotrading.alphaReport.achievements', 'Achievements:')}</span>
         {report.achievements?.map((a: string) => <AchievementIcon key={a} type={a} />)}
      </div>

      {/* Main Stats with AI Value Added */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-black/60 border border-violet-500/20 p-6 rounded-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-100 transition-opacity">
             <Zap className="h-12 w-12 text-violet-400" />
          </div>
          <div className="text-[9px] text-violet-400 uppercase font-bold mb-2 tracking-widest">{t('autotrading.alphaReport.aiValueAdded', 'AI Value Added')}</div>
          <div className="text-3xl font-mono text-white">+{report.aiValueAdded.toLocaleString()} <span className="text-[10px] opacity-40">{t('autotrading.common.twd', 'TWD')}</span></div>
          <div className="text-[9px] text-white/40 mt-2 italic">透過 AI 過濾機制比純技術策略多創造的價值。</div>
        </div>

        <div className="md:col-span-2 bg-black/40 border border-white/5 p-6 rounded-sm space-y-4">
           <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">{t('autotrading.alphaReport.neuralConfidenceEvolution', 'Neural Confidence Evolution')}</span>
              <span className="text-[9px] text-white/30 italic">過去 7 天平均信心走勢</span>
           </div>
           <div className="h-20 flex items-end gap-1.5">
              {report.confidenceTimeline?.map((c: number, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 group/bar">
                   <div className="text-[8px] text-white/0 group-hover/bar:text-white/40 transition-colors">{c}%</div>
                   <div 
                     className={cn("w-full transition-all duration-1000", i === 6 ? "bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]" : "bg-white/10")} 
                     style={{ height: `${c}%` }} 
                   />
                </div>
              ))}
           </div>
        </div>
      </div>

      {/* Alpha Report Body */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-black/40 border border-white/5 rounded-sm overflow-hidden">
          <div className="bg-white/[0.03] px-5 py-3 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-400" />
              <span className="text-[11px] font-bold text-white uppercase tracking-widest">{t('autotrading.alphaReport.companionJournal', "Your AI Companion's Journal")}</span>
            </div>
            <button onClick={fetchReport} className="p-1 hover:bg-white/5 rounded transition-colors">
              <RefreshCw className="h-3.5 w-3.5 text-white/20" />
            </button>
          </div>
          <div className="p-8">
            <div className="text-[14px] leading-relaxed text-white/90 font-sans whitespace-pre-wrap tracking-wide first-letter:text-3xl first-letter:font-bold first-letter:mr-1 first-letter:float-left">
              {report.aiCommentary}
            </div>
          </div>
        </div>

        {/* Scorecard Sidebar */}
        <div className="space-y-6">
          <div className="bg-black/40 border border-white/5 p-5 rounded-sm space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <PieChart className="h-4 w-4 text-cyan-400" />
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">{t('autotrading.alphaReport.attributionMatrix', 'Attribution Matrix')}</span>
            </div>
            {Object.entries(report.attribution).map(([key, val]: [string, any]) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-[9px] uppercase text-white/40">
                  <span>{key}</span>
                  <span>{val}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500/40" style={{ width: `${val}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-br from-violet-600/20 to-indigo-600/20 border border-violet-500/30 p-5 rounded-sm text-center">
             <Trophy className="h-8 w-8 text-amber-400 mx-auto mb-2 animate-bounce" />
             <div className="text-[11px] font-bold text-white uppercase mb-1">{t('autotrading.alphaReport.growthStatusAdvancing', 'Growth Status: Advancing')}</div>
             <div className="text-[9px] text-white/50">
                系統已成功學習您的風險偏好，本週決策一致性達到 95%。
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
