import React, { useEffect, useRef } from 'react';

interface MathDisplayProps {
  latex: string;
  className?: string;
  displayMode?: boolean; // true for block math (centered), false for inline
}

export const MathDisplay: React.FC<MathDisplayProps> = ({ latex, className = '', displayMode = false }) => {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Wrap the latex in appropriate delimiters for MathJax
    // \( ... \) for inline, \[ ... \] for display (block)
    const formattedLatex = displayMode 
      ? `\\[${latex}\\]` 
      : `\\(${latex}\\)`;

    container.innerHTML = formattedLatex;

    // Access MathJax from window
    const mathJax = (window as any).MathJax;

    if (mathJax && mathJax.typesetPromise) {
      mathJax.typesetPromise([container])
        .catch((err: any) => {
          console.error("MathJax typesetting error:", err);
          // Fallback to text if rendering fails heavily
          container.innerText = latex; 
        });
    }
  }, [latex, displayMode]);

  return <span ref={containerRef} className={`math-display ${className}`} />;
};