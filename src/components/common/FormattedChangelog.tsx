import React from 'react';

interface FormattedChangelogProps {
  notes?: string;
  className?: string;
}

export const FormattedChangelog: React.FC<FormattedChangelogProps> = ({ notes, className = '' }) => {
  if (!notes || !notes.trim()) {
    return <p className="text-gray-400 italic text-xs">Bug fixes, performance improvements, and media streaming updates.</p>;
  }

  const lines = notes.split('\n');
  return (
    <div className={`space-y-1.5 text-xs text-gray-300 font-sans ${className}`}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;

        // Release Section Divider or Header
        if (trimmed.startsWith('📦') || trimmed.startsWith('###') || trimmed.startsWith('##')) {
          const headerText = trimmed.replace(/^#{1,3}\s*/, '');
          return (
            <div key={idx} className="pt-2 pb-1 border-b border-hbo-border/50 text-white font-bold text-xs flex items-center gap-1.5 text-hbo-cyan">
              <span>{headerText}</span>
            </div>
          );
        }

        if (trimmed.startsWith('━━━━━') || trimmed === '---') {
          return <hr key={idx} className="border-hbo-border/40 my-2" />;
        }

        // Bullet points
        const isBullet = trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ');
        const cleanContent = isBullet ? trimmed.replace(/^[\*\-•]\s*/, '') : trimmed;

        // Detect conventional commit prefixes
        const featMatch = cleanContent.match(/^(feat|feature)(\([^\)]+\))?:\s*/i);
        const fixMatch = cleanContent.match(/^fix(\([^\)]+\))?:\s*/i);
        const perfMatch = cleanContent.match(/^perf(\([^\)]+\))?:\s*/i);
        const uiMatch = cleanContent.match(/^ui(\([^\)]+\))?:\s*/i);
        const refactorMatch = cleanContent.match(/^(refactor|build|chore)(\([^\)]+\))?:\s*/i);

        let badge = null;
        let displayContent = cleanContent;

        if (featMatch) {
          badge = <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase mr-1.5">🚀 FEAT</span>;
          displayContent = cleanContent.substring(featMatch[0].length);
        } else if (fixMatch) {
          badge = <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase mr-1.5">🐛 FIX</span>;
          displayContent = cleanContent.substring(fixMatch[0].length);
        } else if (perfMatch) {
          badge = <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase mr-1.5">⚡ PERF</span>;
          displayContent = cleanContent.substring(perfMatch[0].length);
        } else if (uiMatch) {
          badge = <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase mr-1.5">🎨 UI</span>;
          displayContent = cleanContent.substring(uiMatch[0].length);
        } else if (refactorMatch) {
          badge = <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase mr-1.5">📦 {refactorMatch[1].toUpperCase()}</span>;
          displayContent = cleanContent.substring(refactorMatch[0].length);
        }

        return (
          <div key={idx} className={`flex items-start gap-2 ${isBullet ? 'pl-1.5' : ''}`}>
            {isBullet && <span className="w-1.5 h-1.5 rounded-full bg-hbo-cyan/60 mt-1.5 flex-shrink-0" />}
            <div className="leading-relaxed flex-1 break-words">
              {badge}
              <span>{displayContent}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
