import React, { useMemo } from 'react';
import { BingoCardData, BingoItem } from '../types';
import { MathDisplay } from './MathDisplay';

interface BingoCardProps {
  card: BingoCardData;
  rows: number;
  cols: number;
  isMath: boolean;
  className?: string; // Allow passing classes for selection
  id?: string;
}

export const BingoCard: React.FC<BingoCardProps> = ({ card, rows, cols, isMath, className = '', id }) => {
  
  // Transform flat array into rows for rendering
  const gridRows = useMemo(() => {
    const result = [];
    for (let i = 0; i < rows; i++) {
      result.push(card.cells.slice(i * cols, (i + 1) * cols));
    }
    return result;
  }, [card.cells, rows, cols]);

  return (
    <div 
      id={id}
      className={`bingo-card bg-white border-2 border-black p-4 mb-8 mx-4 shadow-sm w-[300px] max-w-full ${className}`}
    >
      <div className="text-center mb-2 font-bold uppercase tracking-wider border-b-2 border-black pb-1 text-sm">
        Bingo Kaart #{card.id}
      </div>
      
      <div className="w-full flex flex-col border-2 border-black">
          {gridRows.map((rowItems, rowIndex) => (
            <div key={rowIndex} className="flex flex-1 w-full">
              {rowItems.map((cell, colIndex) => {
                const isFree = cell === 'GRATIS';
                const item = !isFree ? (cell as BingoItem) : null;
                
                return (
                  <div 
                    key={colIndex}
                    className={`
                      flex-1 border border-black flex items-center justify-center p-1 relative
                      ${isFree ? 'bg-gray-200' : 'bg-white'}
                    `}
                    style={{
                      aspectRatio: '1/1', // Keep cells square-ish
                      fontSize: isFree ? '0.8rem' : Math.max(0.7, 1.1 - (Math.max(rows, cols) * 0.1)) + 'rem',
                      fontWeight: 'bold',
                      color: '#111827'
                    }}
                  >
                    {isFree ? (
                      <span className="tracking-widest">GRATIS</span>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center overflow-hidden">
                        <div className={`max-w-full max-h-full px-1 ${!isMath ? 'break-words leading-tight text-center' : ''}`}>
                          {isMath ? (
                            <MathDisplay latex={item?.answer || ''} />
                          ) : (
                            <span>{item?.answer}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
};
