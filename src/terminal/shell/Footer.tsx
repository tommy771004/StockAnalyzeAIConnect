export function Footer() {
  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-(--color-term-border) bg-(--color-term-bg) px-5 text-[11px] tracking-wider text-(--color-term-muted)">
      <div className="flex items-center gap-4">
        <span className="text-(--color-term-accent) font-semibold">FIN-TERMINAL</span>
        <span>© 2024 FIN-TERMINAL</span>
        <span className="hidden sm:inline">|</span>
        <span className="hidden sm:inline">
          系統狀態：
          <span className="text-(--color-term-positive)">正常</span>
        </span>
      </div>
      <div className="flex items-center gap-5">
        <a href="#" className="hover:text-(--color-term-text)">服務條款</a>
        <a href="#" className="hover:text-(--color-term-text)">隱私政策</a>
        <a href="#" className="hover:text-(--color-term-text)">聯絡支援</a>
      </div>
    </footer>
  );
}
