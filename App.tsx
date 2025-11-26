import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BingoItem, BingoCardData, GeneratorStatus, SubjectContext } from './types';
import { generateBingoItems, detectSubject } from './services/geminiService';
import { BingoCard } from './components/BingoCard';
import { MathDisplay } from './components/MathDisplay';
import { Loader2, RefreshCw, LayoutGrid, ListChecks, Sparkles, Image as ImageIcon, X, Copy, Wand2, Settings2, Calculator, Check, Download, FileImage } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';
import FileSaver from 'file-saver';

const App: React.FC = () => {
  const [status, setStatus] = useState<GeneratorStatus>(GeneratorStatus.IDLE);
  const [items, setItems] = useState<BingoItem[]>([]);
  const [cards, setCards] = useState<BingoCardData[]>([]);
  
  // Context
  const [subjectContext, setSubjectContext] = useState<SubjectContext>({ subject: '', isMath: false });
  const [tempSubjectName, setTempSubjectName] = useState('');

  // Grid Settings
  const [gridRows, setGridRows] = useState<number>(3);
  const [gridCols, setGridCols] = useState<number>(3);
  
  const [cardCount, setCardCount] = useState<number>(30);
  const [poolSize, setPoolSize] = useState<number>(13);
  const [minPoolSize, setMinPoolSize] = useState<number>(9);
  
  const [topic, setTopic] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [generationMode, setGenerationMode] = useState<'similar' | 'exact'>('similar');
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingImages, setIsDownloadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    console.log('Bingo App v1.0.5 Loaded');
  }, []);

  // --- Combinatorics Helpers ---
  const getCombinations = (n: number, r: number): number => {
    if (r > n) return 0;
    if (r === 0 || r === n) return 1;
    if (r > n / 2) r = n - r; 
    let res = 1;
    for (let i = 1; i <= r; i++) {
        res = res * (n - i + 1) / i;
    }
    return Math.round(res);
  };

  const getItemsPerCard = useCallback(() => {
    // Return total cells, no free space subtraction
    return gridRows * gridCols;
  }, [gridRows, gridCols]);

  useEffect(() => {
    const itemsPerCard = getItemsPerCard();
    let calculatedMinPool = itemsPerCard;
    while (true) {
      const combinations = getCombinations(calculatedMinPool, itemsPerCard);
      if (combinations >= cardCount) {
        break;
      }
      calculatedMinPool++;
      if (calculatedMinPool > 100) break;
    }
    const suggestedMin = Math.max(calculatedMinPool, itemsPerCard + 1);
    setMinPoolSize(suggestedMin);
    setPoolSize(suggestedMin); 
  }, [cardCount, getItemsPerCard]);


  // --- Logic ---

  const shuffleArray = <T,>(array: T[]): T[] => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const generateCards = useCallback((pool: BingoItem[], count: number) => {
    const newCards: BingoCardData[] = [];
    const itemsNeededPerCard = gridRows * gridCols;

    for (let i = 1; i <= count; i++) {
      const shuffled = shuffleArray(pool);
      if (shuffled.length < itemsNeededPerCard) {
        console.error("Not enough items to fill a card!");
        return;
      }
      // Fill the card completely with items (no free space)
      const selectedItems = shuffled.slice(0, itemsNeededPerCard);
      newCards.push({ id: i, cells: selectedItems });
    }
    setCards(newCards);
  }, [gridRows, gridCols]);

  // Step 1: Detect Subject
  const handleStartGeneration = async () => {
    if (!topic && !selectedImage) {
        alert("Voer een onderwerp in of upload een afbeelding.");
        return;
    }
    setStatus(GeneratorStatus.DETECTING);
    try {
      const context = await detectSubject(topic, selectedImage);
      setSubjectContext(context);
      setTempSubjectName(context.subject);
      setStatus(GeneratorStatus.CONFIRMING);
    } catch (e) {
      console.error(e);
      setStatus(GeneratorStatus.ERROR);
    }
  };

  // Step 2: Confirm & Generate
  const handleConfirmAndGenerate = async () => {
    // Update context with potentially edited name
    const finalContext = { ...subjectContext, subject: tempSubjectName };
    setSubjectContext(finalContext);
    
    setStatus(GeneratorStatus.GENERATING);
    try {
      const pool = await generateBingoItems(finalContext, topic, poolSize, selectedImage, generationMode);
      setItems(pool);
      generateCards(pool, cardCount);
      setStatus(GeneratorStatus.SUCCESS);
    } catch (e) {
      console.error(e);
      setStatus(GeneratorStatus.ERROR);
    }
  };

  const handleRegenerateCardsOnly = () => {
    if (items.length > 0) {
      generateCards(items, cardCount);
    }
  };

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    
    // Wait for state to settle
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      // Initialize PDF: A4, Portrait, Millimeters
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const contentWidth = pageWidth - (margin * 2);
      
      // Configuration for layout
      const cardWidth = 90; // Fit 2 cards (90+90) + margins on 210mm width
      const cardGap = 10;
      
      // Add Title to first page
      pdf.setFontSize(22);
      pdf.setFont("helvetica", "bold");
      pdf.text(`Bingo: ${subjectContext.subject}`, pageWidth / 2, 20, { align: 'center' });
      
      let cursorY = 30; // Start below title
      let cursorX = margin;
      
      const cardElements = document.querySelectorAll('.bingo-card-export');
      
      for (let i = 0; i < cardElements.length; i++) {
        const cardEl = cardElements[i] as HTMLElement;
        
        // Capture individual card
        const canvas = await html2canvas(cardEl, { 
          scale: 2, // Good quality
          useCORS: true,
          logging: false
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgWidth = cardWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // Determine Column (0 or 1)
        const colIndex = i % 2;
        
        // Check vertical space BEFORE placing the FIRST card of a row
        if (colIndex === 0) {
          if (cursorY + imgHeight > pageHeight - margin) {
            pdf.addPage();
            cursorY = margin + 10; // Reset top with slight pad
          }
        }
        
        // Calculate X position based on column
        cursorX = margin + (colIndex * (cardWidth + cardGap));
        
        // Place image
        pdf.addImage(imgData, 'JPEG', cursorX, cursorY, imgWidth, imgHeight);
        
        // Advance cursorY only after the second card (or if it's the last card)
        if (colIndex === 1 || i === cardElements.length - 1) {
          cursorY += imgHeight + 10; // Move down for next row
        }
      }
      
      // --- Calling List Page ---
      const listElement = document.getElementById('calling-list-export');
      if (listElement) {
        
        // 1. Capture the entire list at high resolution
        const listCanvas = await html2canvas(listElement, { 
          scale: 2,
          useCORS: true 
        });

        // 2. Identify row positions to find safe split points
        const rows = listElement.querySelectorAll('tbody tr');
        const rowBreakpoints: number[] = [];
        // Map row bottom positions to canvas coordinates
        const scaleFactor = listCanvas.height / listElement.offsetHeight;
        
        rows.forEach(row => {
          const rowBottom = (row as HTMLElement).offsetTop + (row as HTMLElement).offsetHeight;
          rowBreakpoints.push(rowBottom * scaleFactor);
        });

        let currentSrcY = 0;
        let remainingSrcHeight = listCanvas.height;
        const maxPageContentHeightMM = pageHeight - (margin * 2);
        // Calculate max pixel height on canvas that fits on one PDF page
        // Ratio: canvas width -> PDF content width
        const canvasToPdfRatio = contentWidth / listCanvas.width;
        const maxSrcHeightPerPage = maxPageContentHeightMM / canvasToPdfRatio;

        while (remainingSrcHeight > 0) {
          pdf.addPage();
          
          let sliceHeight = Math.min(remainingSrcHeight, maxSrcHeightPerPage);
          
          // If we are not at the end, finding the nearest row breakpoint to avoid cutting text
          if (remainingSrcHeight > maxSrcHeightPerPage) {
             const cutPoint = currentSrcY + sliceHeight;
             // Find largest breakpoint smaller than cutPoint
             const safeBreak = rowBreakpoints.reverse().find(bp => bp < cutPoint && bp > currentSrcY);
             rowBreakpoints.reverse(); // restore order if needed, or just findLast

             if (safeBreak) {
               sliceHeight = safeBreak - currentSrcY;
             }
          }

          // Create a temp canvas for this slice
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = listCanvas.width;
          tempCanvas.height = sliceHeight;
          const ctx = tempCanvas.getContext('2d');
          if (ctx) {
             ctx.drawImage(
               listCanvas, 
               0, currentSrcY, listCanvas.width, sliceHeight, // Source
               0, 0, listCanvas.width, sliceHeight // Dest
             );
             
             const sliceImgData = tempCanvas.toDataURL('image/jpeg', 0.95);
             const pdfHeight = sliceHeight * canvasToPdfRatio;
             
             pdf.addImage(sliceImgData, 'JPEG', margin, margin, contentWidth, pdfHeight);
          }

          currentSrcY += sliceHeight;
          remainingSrcHeight -= sliceHeight;
        }
      }

      pdf.save(`Bingo-${subjectContext.subject.replace(/[^a-z0-9]/gi, '_')}.pdf`);

    } catch (error) {
      console.error("PDF Generation failed", error);
      alert("Er ging iets mis bij het maken van de PDF.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadImages = async () => {
    setIsDownloadingImages(true);
    await new Promise(resolve => setTimeout(resolve, 500)); // UI update delay
    
    try {
      const zip = new JSZip();
      const folderName = `Bingo-${subjectContext.subject.replace(/[^a-z0-9]/gi, '_')}`;
      const folder = zip.folder(folderName);
      
      const cardElements = document.querySelectorAll('.bingo-card-export');
      
      // Capture Cards
      for (let i = 0; i < cardElements.length; i++) {
        const cardEl = cardElements[i] as HTMLElement;
        const canvas = await html2canvas(cardEl, { 
          scale: 2, 
          useCORS: true,
          logging: false
        });
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob && folder) {
           folder.file(`Bingo_Kaart_${i + 1}.png`, blob);
        }
      }

      // Capture Calling List
      const listElement = document.getElementById('calling-list-export');
      if (listElement && folder) {
        const listCanvas = await html2canvas(listElement, { 
          scale: 2, 
          useCORS: true 
        });
        const listBlob = await new Promise<Blob | null>(resolve => listCanvas.toBlob(resolve, 'image/png'));
        if (listBlob) {
           folder.file(`Oproeplijst.png`, listBlob);
        }
      }

      // Generate ZIP
      const content = await zip.generateAsync({ type: "blob" });
      FileSaver.saveAs(content, `${folderName}.zip`);

    } catch (e) {
      console.error(e);
      alert("Fout bij het maken van de afbeeldingen.");
    } finally {
      setIsDownloadingImages(false);
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        setGenerationMode('similar'); 
      };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen">
      {/* Screen-only Controls Header */}
      <div className="print:hidden bg-white border-b shadow-sm sticky top-0 z-10 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Bingo Generator</h1>
              <p className="text-gray-500 text-sm mt-1">
                Maak bingokaarten voor elk vak of onderwerp.
              </p>
            </div>
            
            <div className="flex gap-2">
               {status === GeneratorStatus.SUCCESS && (
                <>
                  <button 
                    onClick={handleDownloadImages}
                    disabled={isDownloading || isDownloadingImages}
                    className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-wait text-sm"
                    title="Download als losse afbeeldingen (ZIP)"
                  >
                    {isDownloadingImages ? <Loader2 size={18} className="animate-spin" /> : <FileImage size={18} />}
                    {isDownloadingImages ? 'Zippen...' : 'Download ZIP'}
                  </button>
                  <button 
                    onClick={handleDownloadPDF}
                    disabled={isDownloading || isDownloadingImages}
                    className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors shadow-sm disabled:opacity-70 disabled:cursor-wait text-sm"
                    title="Download als PDF"
                  >
                    {isDownloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                    {isDownloading ? 'Maken...' : 'Download PDF'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start bg-gray-50 p-4 rounded-xl border">
            <div className="md:col-span-2 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kies een Onderwerp <span className="font-normal text-gray-400">of upload een voorbeeld</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-grow">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Sparkles size={16} className="text-gray-400" />
                    </div>
                    <input 
                      type="text" 
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="w-full pl-10 border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                      placeholder={selectedImage ? "Optioneel: Geef extra context..." : "Typ een onderwerp (bijv. 'Dieren', 'WO2', 'Tafels')..."}
                    />
                  </div>
                  
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleImageUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex items-center justify-center p-2 rounded-md border transition-colors ${selectedImage ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                    title="Upload een voorbeeld"
                  >
                    <ImageIcon size={20} />
                  </button>
                </div>

                {selectedImage && (
                  <div className="mt-3 bg-white p-3 rounded-lg border border-blue-100 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="relative">
                        <img src={selectedImage} alt="Voorbeeld" className="h-24 w-auto rounded border border-gray-200 object-cover" />
                        <button 
                          onClick={clearImage}
                          className="absolute -top-2 -right-2 bg-white text-red-500 border border-gray-200 rounded-full p-1 hover:bg-red-50 shadow-sm"
                          title="Verwijder afbeelding"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      
                      <div className="flex-grow space-y-2">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          Modus
                        </label>
                        <div className="flex flex-col gap-2">
                          <label className={`flex items-center gap-2 p-2 rounded cursor-pointer border transition-all ${generationMode === 'similar' ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-blue-300'}`}>
                            <input 
                              type="radio" 
                              name="mode" 
                              checked={generationMode === 'similar'} 
                              onChange={() => setGenerationMode('similar')}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <Wand2 size={16} className={generationMode === 'similar' ? 'text-blue-600' : 'text-gray-400'} />
                            <span className="text-sm">Genereer <b>soortgelijke</b> items</span>
                          </label>
                          
                          <label className={`flex items-center gap-2 p-2 rounded cursor-pointer border transition-all ${generationMode === 'exact' ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-transparent hover:bg-gray-100'}`}>
                            <input 
                              type="radio" 
                              name="mode" 
                              checked={generationMode === 'exact'} 
                              onChange={() => setGenerationMode('exact')}
                              className="text-blue-600 focus:ring-blue-500"
                            />
                            <Copy size={16} className={generationMode === 'exact' ? 'text-blue-600' : 'text-gray-400'} />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">Neem <b>exact</b> over</span>
                              <span className="text-[10px] text-gray-500 leading-tight">Vult aan indien nodig</span>
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-2 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <Settings2 size={14} />
                      Afmetingen
                    </label>
                    <div className="flex items-center gap-2">
                      <select 
                        value={gridRows}
                        onChange={(e) => setGridRows(Number(e.target.value))}
                        className="flex-1 border border-gray-300 rounded-md p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                         {[3, 4, 5].map(n => <option key={n} value={n}>{n} rijen</option>)}
                      </select>
                      <span className="text-gray-400">×</span>
                      <select 
                        value={gridCols}
                        onChange={(e) => setGridCols(Number(e.target.value))}
                        className="flex-1 border border-gray-300 rounded-md p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                         {[3, 4, 5].map(n => <option key={n} value={n}>{n} kol.</option>)}
                      </select>
                    </div>
                 </div>

                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Aantal Kaarten</label>
                    <input 
                      type="number" 
                      min={1} 
                      max={100}
                      value={cardCount}
                      onChange={(e) => setCardCount(parseInt(e.target.value) || 0)}
                      className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                 </div>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <label className="block text-sm font-medium text-blue-900 mb-1 flex items-center gap-2">
                   <Calculator size={14} />
                   Aantal Items
                </label>
                <div className="flex gap-2 items-center">
                  <input 
                    type="number" 
                    min={minPoolSize} 
                    max={60}
                    value={poolSize}
                    onChange={(e) => setPoolSize(parseInt(e.target.value) || minPoolSize)}
                    className="flex-1 border border-blue-200 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none text-blue-900 font-bold"
                  />
                  <div className="text-xs text-blue-600 max-w-[140px] leading-tight">
                    Minimaal <b>{minPoolSize}</b> unieke items nodig.
                  </div>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button 
                  onClick={handleStartGeneration}
                  disabled={status === GeneratorStatus.GENERATING || status === GeneratorStatus.DETECTING}
                  className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 font-medium w-full md:w-auto"
                >
                  {status === GeneratorStatus.DETECTING || status === GeneratorStatus.GENERATING ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <LayoutGrid size={18} />
                  )}
                  {status === GeneratorStatus.DETECTING ? 'Analyseren...' : 
                   status === GeneratorStatus.GENERATING ? 'Genereren...' : 'Maken'}
                </button>
                
                {status === GeneratorStatus.SUCCESS && (
                  <button 
                  onClick={handleRegenerateCardsOnly}
                  title="Herschud kaarten"
                  className="px-3 py-2 border border-gray-300 bg-white rounded-md hover:bg-gray-50 text-gray-700"
                >
                  <RefreshCw size={18} />
                </button>
                )}
              </div>
            </div>
          </div>
          
          {status === GeneratorStatus.ERROR && (
             <div className="bg-red-50 text-red-700 p-3 rounded-md border border-red-200 text-sm">
                Er is een fout opgetreden. Controleer de API key of input en probeer het opnieuw.
             </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {status === GeneratorStatus.CONFIRMING && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Bevestig Onderwerp</h3>
            <p className="text-gray-600 mb-4">
              Ik heb de input geanalyseerd. Klopt het dat dit over het volgende vak gaat?
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Gedetecteerd Vak</label>
              <div className="space-y-3">
                <input 
                  type="text" 
                  value={tempSubjectName}
                  onChange={(e) => setTempSubjectName(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                
                <label className="flex items-center gap-3 p-3 border rounded-md cursor-pointer transition-colors hover:bg-gray-50 select-none group">
                  <div className={`w-5 h-5 flex items-center justify-center rounded border transition-colors ${subjectContext.isMath ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300 group-hover:border-blue-400'}`}>
                    {subjectContext.isMath && <Check size={14} className="text-white" />}
                  </div>
                  <input 
                    type="checkbox" 
                    checked={subjectContext.isMath}
                    onChange={(e) => setSubjectContext(prev => ({ ...prev, isMath: e.target.checked }))}
                    className="hidden"
                  />
                  <div className="flex-1">
                    <span className="block text-sm font-medium text-gray-900">Wiskunde Modus (LaTeX)</span>
                    <span className="block text-xs text-gray-500">Zet aan voor formules, breuken en symbolen.</span>
                  </div>
                  <Calculator size={18} className={subjectContext.isMath ? "text-blue-600" : "text-gray-400"} />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setStatus(GeneratorStatus.IDLE)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
              >
                Annuleren
              </button>
              <button 
                onClick={handleConfirmAndGenerate}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
              >
                <Check size={18} />
                Bevestigen & Maken
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div id="printable-content" className="max-w-5xl mx-auto p-8 bg-white">
        
        {/* Print Instruction Header */}
        {status === GeneratorStatus.SUCCESS && (
          <div className="mb-8 text-center border-b pb-4">
            <h1 className="text-3xl font-bold mb-2">Bingo: {subjectContext.subject}</h1>
            <p className="text-lg text-gray-700">
              De spelleider leest een vraag voor. Weet jij het antwoord? 
              Staat het op je kaart? Streep het door!
            </p>
          </div>
        )}

        {/* Empty State */}
        {status === GeneratorStatus.IDLE && (
          <div className="text-center py-20 text-gray-400">
            <LayoutGrid size={64} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg">Kies een onderwerp en afmetingen, en klik op "Maken".</p>
          </div>
        )}

        {/* Cards Grid */}
        {cards.length > 0 && (
          <div className="cards-container flex flex-wrap justify-center items-start">
            {cards.map((card) => (
              <BingoCard 
                key={card.id} 
                card={card} 
                rows={gridRows} 
                cols={gridCols} 
                isMath={subjectContext.isMath}
                className="bingo-card-export" 
              />
            ))}
          </div>
        )}

        {/* Teacher Calling List */}
        {items.length > 0 && status === GeneratorStatus.SUCCESS && (
          <div id="calling-list-export" className="mt-8 border-t-2 border-dashed pt-8 px-4 bg-white">
            <div className="flex items-center justify-center gap-3 mb-6">
              <ListChecks size={32} />
              <h2 className="text-2xl font-bold text-center">Oproeplijst</h2>
            </div>
            
            <p className="text-center mb-6 text-gray-600 italic">
              Hieronder staan de {items.length} items die in het spel zitten. 
              Lees de vraag/omschrijving (links) voor. De spelers zoeken het antwoord (rechts).
            </p>
            
            <div className="w-full max-w-4xl mx-auto">
              <table className="w-full text-left border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-4 border border-gray-300 w-16 text-center">#</th>
                    <th className="p-4 border border-gray-300">Op te lezen Vraag</th>
                    <th className="p-4 border border-gray-300 font-bold min-w-[150px]">Antwoord (Op kaart)</th>
                    <th className="p-4 border border-gray-300 w-16 text-center">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id} className="even:bg-gray-50">
                      <td className="p-4 border border-gray-300 text-center text-gray-500">{idx + 1}</td>
                      <td className="p-4 border border-gray-300 font-medium text-lg">
                        {subjectContext.isMath ? <MathDisplay latex={item.problem} /> : item.problem}
                      </td>
                      <td className="p-4 border border-gray-300 font-bold text-lg">
                        {subjectContext.isMath ? <MathDisplay latex={item.answer} /> : item.answer}
                      </td>
                      <td className="p-4 border border-gray-300 text-center">
                        <div className="w-6 h-6 border-2 border-gray-300 rounded mx-auto"></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;