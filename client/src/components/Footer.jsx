export default function Footer() {
  return (
    <footer className="border-t border-[#21262D] bg-[#161B22]/80 px-4 py-2 flex items-center justify-between flex-wrap gap-2 text-[9.5px] font-mono text-[#8B949E] flex-shrink-0">
      <span className="opacity-60">Path Optimization in Robotics · Master's Project</span>
      <span className="flex items-center gap-2">
        <span className="text-[#00D4FF]">Developed by AI Engineer</span>
        <span className="text-[#21262D]">|</span>
        <a href="https://developer.techydhruv.com" target="_blank" rel="noopener" id="footer-web"
           className="hover:text-[#00D4FF] transition-colors underline underline-offset-2">
          developer.techydhruv.com
        </a>
        <span className="text-[#21262D]">|</span>
        <a href="https://instagram.com/ai.drpatel" target="_blank" rel="noopener" id="footer-ig"
           className="hover:text-[#00D4FF] transition-colors">
          IG: @ai.drpatel
        </a>
      </span>
      <span className="opacity-60">APF · <span className="text-[#00FF9F]">∇U</span> · Gradient Descent</span>
    </footer>
  );
}
