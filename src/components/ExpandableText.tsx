import { useMemo, useState } from 'react';

interface ExpandableTextProps {
  text: string;
  maxChars?: number;
  className?: string;
  textClassName?: string;
  buttonClassName?: string;
  preserveWhitespace?: boolean;
}

export function ExpandableText({
  text,
  maxChars = 30,
  className = '',
  textClassName = '',
  buttonClassName = '',
  preserveWhitespace = false,
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const normalized = text.trim();
  const units = useMemo(() => Array.from(normalized), [normalized]);
  const isLong = units.length > maxChars;
  const displayText =
    isLong && !expanded ? `${units.slice(0, maxChars).join('')}…` : normalized;

  if (!normalized) return null;

  return (
    <div className={className}>
      <span
        className={`${preserveWhitespace ? 'whitespace-pre-wrap' : ''} ${textClassName}`.trim()}
        title={isLong ? normalized : undefined}
      >
        {displayText}
      </span>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`mt-1 text-[11px] font-medium text-accent hover:underline ${buttonClassName}`.trim()}
        >
          {expanded ? '접기' : '더보기'}
        </button>
      ) : null}
    </div>
  );
}
