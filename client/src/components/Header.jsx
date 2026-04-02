import { memo } from "react";

const Header = memo(function Header({ connected }) {
  return (
    <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#21262D] bg-[#161B22]/95 backdrop-blur flex-shrink-0">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
             style={{ background: "linear-gradient(135deg,#00D4FF,#7C3AED)", boxShadow: "0 0 14px rgba(0,212,255,.28)" }}>
          ⚙
        </div>
        <div>
          <h1 className="text-[13px] font-bold text-white tracking-tight">Interactive APF Navigation</h1>
          <p className="text-[9px] text-[#8B949E] font-mono">Real-Time Path Planning · Cost Minimization</p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-[#8B949E] bg-[#0D1117] border border-[#21262D] px-3 py-1 rounded-full">
        <span className="text-[#00D4FF]">∇U</span>
        Gradient Descent Path Planner
        <span className="text-[#00FF9F]">APF v2</span>
      </div>

      <div className={`flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-full border transition-all ${
        connected
          ? "border-[#00FF9F]/30 bg-[#00FF9F]/08 text-[#00FF9F]"
          : "border-red-500/30 bg-red-500/08 text-red-400"
      }`}>
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-[#00FF9F] animate-pulse" : "bg-red-400"}`}/>
        {connected ? "Server Connected" : "Server Offline"}
      </div>
    </header>
  );
});

export default Header;
