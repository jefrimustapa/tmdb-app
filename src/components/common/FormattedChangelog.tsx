import React from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';
import { openExternalUrl } from '../../services/browserService';

interface FormattedChangelogProps {
  notes?: string;
  className?: string;
  maxHighlightsPerSection?: number;
}

export const FormattedChangelog: React.FC<FormattedChangelogProps> = ({
  notes,
  className = '',
  maxHighlightsPerSection = 5
}) => {
  if (!notes || !notes.trim()) {
    return (
      <div className="flex items-center gap-2 py-3 px-3 rounded-xl bg-white/[0.03] border border-white/5 text-gray-400 italic text-xs">
        <Sparkles className="w-4 h-4 text-hbo-cyan/70 flex-shrink-0" />
        <span>Bug fixes, performance improvements, and media streaming updates.</span>
      </div>
    );
  }

  const rawLines = notes.split('\n');
  const renderedElements: React.ReactNode[] = [];
  let currentSectionBulletCount = 0;

  for (let idx = 0; idx < rawLines.length; idx++) {
    const trimmed = rawLines[idx].trim();
    if (!trimmed) {
      renderedElements.push(<div key={`spacer-${idx}`} className="h-1.5" />);
      continue;
    }

    // Release Section Divider or Header
    if (trimmed.startsWith('📦') || trimmed.startsWith('###') || trimmed.startsWith('##')) {
      currentSectionBulletCount = 0;
      const headerText = trimmed.replace(/^#{1,3}\s*/, '');
      renderedElements.push(
        <div
          key={`header-${idx}`}
          className="pt-2.5 pb-1.5 border-b border-hbo-border/60 text-white font-bold text-xs flex items-center justify-between gap-2 text-hbo-cyan"
        >
          <span className="truncate">{headerText}</span>
        </div>
      );
      continue;
    }

    if (trimmed.startsWith('━━━━━') || trimmed === '---') {
      currentSectionBulletCount = 0;
      renderedElements.push(<hr key={`hr-${idx}`} className="border-hbo-border/40 my-3" />);
      continue;
    }

    // Full Changelog Link
    const changelogMatch = trimmed.match(/https?:\/\/github\.com\/[^\/]+\/[^\/]+\/compare\/\S+/i);
    if (changelogMatch || trimmed.toLowerCase().includes('full changelog')) {
      const url = changelogMatch ? changelogMatch[0].replace(/\)+$/, '') : null;
      if (url) {
        renderedElements.push(
          <div key={`changelog-link-${idx}`} className="pt-2 pb-1">
            <button
              type="button"
              onClick={() => openExternalUrl(url)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-hbo-cyan/10 hover:bg-hbo-cyan/20 text-hbo-cyan border border-hbo-cyan/30 text-xs font-semibold transition-all hover:scale-[1.02] cursor-pointer tv-focus-target"
            >
              <span>View Full Changelog on GitHub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      }
      continue;
    }

    // Bullet points
    const isBullet = trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• ');
    let cleanContent = isBullet ? trimmed.replace(/^[\*\-•]\s*/, '') : trimmed;

    // Filter noise commits
    if (/^(chore\(version\)|chore\(release\)|Merge pull request|Merge branch)/i.test(cleanContent)) {
      continue;
    }

    // Strip GitHub PR author and URL suffix: e.g. "by @user in https://github.com/..."
    cleanContent = cleanContent.replace(/\s+by\s+@[a-zA-Z0-9_\-]+\s+in\s+https?:\/\/\S+/i, '').trim();

    // Check if this is the "+ X more improvements" indicator
    if (cleanContent.startsWith('+') && cleanContent.includes('more')) {
      renderedElements.push(
        <div key={`more-${idx}`} className="pl-3.5 pt-1 text-[11px] text-gray-400 font-mono italic">
          <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">
            {cleanContent}
          </span>
        </div>
      );
      continue;
    }

    // Cap max highlights per section
    if (maxHighlightsPerSection > 0 && currentSectionBulletCount >= maxHighlightsPerSection) {
      continue;
    }
    currentSectionBulletCount++;

    // Detect conventional commit prefixes
    const featMatch = cleanContent.match(/^(feat|feature)(\([^\)]+\))?:\s*/i);
    const fixMatch = cleanContent.match(/^fix(\([^\)]+\))?:\s*/i);
    const perfMatch = cleanContent.match(/^perf(\([^\)]+\))?:\s*/i);
    const uiMatch = cleanContent.match(/^ui(\([^\)]+\))?:\s*/i);
    const refactorMatch = cleanContent.match(/^(refactor|build|chore)(\([^\)]+\))?:\s*/i);

    let badge = null;
    let displayContent = cleanContent;

    if (featMatch) {
      badge = <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase mr-1.5 shadow-sm">🚀 FEAT</span>;
      displayContent = cleanContent.substring(featMatch[0].length);
    } else if (fixMatch) {
      badge = <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase mr-1.5 shadow-sm">🐛 FIX</span>;
      displayContent = cleanContent.substring(fixMatch[0].length);
    } else if (perfMatch) {
      badge = <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase mr-1.5 shadow-sm">⚡ PERF</span>;
      displayContent = cleanContent.substring(perfMatch[0].length);
    } else if (uiMatch) {
      badge = <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase mr-1.5 shadow-sm">🎨 UI</span>;
      displayContent = cleanContent.substring(uiMatch[0].length);
    } else if (refactorMatch) {
      badge = <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase mr-1.5 shadow-sm">📦 {refactorMatch[1].toUpperCase()}</span>;
      displayContent = cleanContent.substring(refactorMatch[0].length);
    }

    renderedElements.push(
      <div key={`bullet-${idx}`} className={`flex items-start gap-2 ${isBullet ? 'pl-1.5' : ''}`}>
        {isBullet && <span className="w-1.5 h-1.5 rounded-full bg-hbo-cyan/70 mt-1.5 flex-shrink-0" />}
        <div className="leading-relaxed flex-1 break-words">
          {badge}
          <span className="text-gray-200">{displayContent}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 text-xs text-gray-300 font-sans ${className}`}>
      {renderedElements}
    </div>
  );
};
