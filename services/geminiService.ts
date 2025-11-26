import { GoogleGenAI, Type } from "@google/genai";
import { BingoItem, SubjectContext } from "../types";

// Helper function to get AI instance safely
const getAIClient = () => {
  const key = process.env.API_KEY;
  if (!key || key.includes("YOUR_API_KEY") || key === "undefined") {
    console.error("API Key invalid:", key);
    throw new Error("API Key ontbreekt of is ongeldig. Controleer Vercel instellingen.");
  }
  return new GoogleGenAI({ apiKey: key });
};

// Helper to clean Markdown code blocks from JSON response
function cleanJSON(text: string): string {
  if (!text) return "";
  // Remove ```json and ``` or just ```
  return text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
}

/**
 * Extracts the base64 data and mime type from a Data URL.
 */
function parseDataUrl(dataUrl: string) {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    return { mimeType: matches[1], data: matches[2] };
  }
  // Fallback for raw base64 or unexpected formats
  return { mimeType: 'image/jpeg', data: dataUrl.replace(/^data:image\/\w+;base64,/, '') };
}

/**
 * Detects the subject and whether it requires MathJax (LaTeX) rendering.
 */
export const detectSubject = async (
  topic: string,
  imageBase64?: string | null
): Promise<SubjectContext> => {
  const ai = getAIClient();

  const parts: any[] = [];
  
  if (imageBase64) {
    const { mimeType, data } = parseDataUrl(imageBase64);
    parts.push({
      inlineData: {
        mimeType,
        data
      }
    });
  }
  
  parts.push({
    text: `Analyseer de input (tekst: "${topic}") en/of de afbeelding.\n\n1. Bepaal het schoolvak (bijv. Wiskunde, Geschiedenis).\n2. Zet 'isMath' op true ALLEEN als het Wiskunde of een vak met formules is (LaTeX nodig).\n\n`
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            isMath: { type: Type.BOOLEAN }
          }
        }
      }
    });

    const cleanText = cleanJSON(response.text || "");
    if (cleanText) {
        return JSON.parse(cleanText) as SubjectContext;
    }
    throw new Error("Geen antwoord van AI (Leeg)");

  } catch (error: any) {
    console.error("Error detecting subject:", error);
    if (error.message.includes("API Key")) throw error; // Re-throw key errors
    // Fallback default
    return { subject: "Algemeen", isMath: false };
  }
};

/**
 * Generates the pool of bingo items based on subject and mode.
 */
export const generateBingoItems = async (
  context: SubjectContext,
  topicInput: string,
  count: number,
  imageBase64?: string | null,
  mode: 'similar' | 'exact' = 'similar'
): Promise<BingoItem[]> => {
  const ai = getAIClient();
  
  // 1. Construct System Instruction based on context
  let formatInstruction = "";
  if (context.isMath) {
    formatInstruction = `
      NOTATIE (WISKUNDE):
      - Gebruik LaTeX code voor symbolen in zowel 'problem' als 'answer'.
      - GEEN dollartekens ($) rondom de formules.
      - Gebruik \\times voor keer, \\frac{a}{b} voor breuken.
    `;
  } else {
    formatInstruction = `
      NOTATIE (TEKST):
      - Gebruik GEEN LaTeX. Gewone tekst.
      - 'problem': De vraag/omschrijving die de leraar voorleest.
      - 'answer': Het KORTE antwoord (1-4 woorden).
    `;
  }

  const systemInstruction = `
    Je bent een docent voor het vak ${context.subject}.
    Genereer output voor een Bingo spel.
    ${formatInstruction}
    Variatie: Zorg voor minimaal ${count} unieke antwoorden.
  `;

  // 2. Construct User Prompt
  let userPromptText = "";
  if (imageBase64 && mode === 'exact') {
    userPromptText = `Maak een lijst van PRECIES ${count} items. EXTRACTIE: Neem inhoud EXACT over uit de afbeelding. Als er minder dan ${count} items op de afbeelding staan, genereer dan ZELF extra items in dezelfde stijl om aan het totaal te komen.`;
  } else if (imageBase64 && mode === 'similar') {
    userPromptText = `Genereer ${count} NIEUWE unieke items die qua stijl en niveau lijken op de afbeelding.`;
  } else {
    userPromptText = `Onderwerp: "${topicInput}". Genereer precies ${count} unieke items (vraag + antwoord).`;
  }

  const parts: any[] = [];
  if (imageBase64) {
    const { mimeType, data } = parseDataUrl(imageBase64);
    parts.push({
      inlineData: {
        mimeType,
        data
      }
    });
  }
  parts.push({ text: userPromptText });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  problem: { type: Type.STRING },
                  answer: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    const cleanText = cleanJSON(response.text || "");
    if (!cleanText) throw new Error("Geen tekst ontvangen van AI");
    
    const data = JSON.parse(cleanText);
    const itemsArray = data.items || [];

    return itemsArray.map((item: any, index: number) => ({
      id: `item-${index}`,
      problem: item.problem || "Fout",
      answer: item.answer || "Fout",
    }));

  } catch (error: any) {
    console.error("Error generating bingo items:", error);
    if (error.message.includes("API Key")) throw error;
    throw new Error(`Kon geen items genereren: ${error.message}`);
  }
};