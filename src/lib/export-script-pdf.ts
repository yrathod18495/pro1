import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun } from 'docx';

function parseInlineMarkdown(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 700; color: #0f172a;">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/__(.*?)__/g, '<strong style="font-weight: 700; color: #0f172a;">$1</strong>')
    .replace(/_(.*?)_/g, '<em>$1</em>');
}

function formatMarkdownToHtml(text: string): string {
  if (!text) return '';
  const lines = text.split('\n');
  const htmlLines = lines.map(line => {
    const l = line.trim();
    if (!l) return '<div style="height: 6px;"></div>';

    if (l.startsWith('---')) {
      return '<hr style="border: none; border-top: 1px dashed #cbd5e1; margin: 12px 0;" />';
    }
    if (l.startsWith('### ')) {
      return `<h3 style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 12px; margin-bottom: 6px; font-family: system-ui, -apple-system, sans-serif;">${parseInlineMarkdown(l.slice(4))}</h3>`;
    }
    if (l.startsWith('## ')) {
      return `<h2 style="font-size: 17px; font-weight: 800; color: #0f172a; margin-top: 16px; margin-bottom: 8px; font-family: system-ui, -apple-system, sans-serif;">${parseInlineMarkdown(l.slice(3))}</h2>`;
    }
    if (l.startsWith('# ')) {
      return `<h1 style="font-size: 20px; font-weight: 900; color: #0f172a; margin-top: 20px; margin-bottom: 10px; font-family: system-ui, -apple-system, sans-serif;">${parseInlineMarkdown(l.slice(2))}</h1>`;
    }

    return `<p style="font-size: 13.5px; line-height: 1.6; color: #1e293b; margin-bottom: 4px; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Devanagari', sans-serif;">${parseInlineMarkdown(l)}</p>`;
  });

  return htmlLines.join('');
}

export type PdfProgressCallback = (percent: number, phase: 'measuring' | 'rendering') => void;

export async function downloadScriptAsPdf(title: string, rawText: string, filename?: string, onProgress?: PdfProgressCallback) {
  if (!rawText) return;

  const safeTitle = title || '12Labs AI Script';
  const htmlLines = rawText.split('\n').map(line => {
    const l = line.trim();
    if (!l) return '<div class="line-spacer" style="height: 8px;"></div>';
    if (l.startsWith('---')) return '<hr class="line-hr" style="border: none; border-top: 1px dashed #cbd5e1; margin: 12px 0;" />';
    
    let tag = 'p';
    let style = "font-size: 13.5px; line-height: 1.6; color: #1e293b; margin-bottom: 6px; font-family: system-ui, -apple-system, sans-serif;";
    let content = parseInlineMarkdown(l);

    if (l.startsWith('### ')) {
      tag = 'h3';
      style = "font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 12px; margin-bottom: 6px; font-family: system-ui, -apple-system, sans-serif;";
      content = parseInlineMarkdown(l.slice(4));
    } else if (l.startsWith('## ')) {
      tag = 'h2';
      style = "font-size: 17px; font-weight: 800; color: #0f172a; margin-top: 16px; margin-bottom: 8px; font-family: system-ui, -apple-system, sans-serif;";
      content = parseInlineMarkdown(l.slice(3));
    } else if (l.startsWith('# ')) {
      tag = 'h1';
      style = "font-size: 20px; font-weight: 900; color: #0f172a; margin-top: 20px; margin-bottom: 10px; font-family: system-ui, -apple-system, sans-serif;";
      content = parseInlineMarkdown(l.slice(2));
    }

    return `<${tag} class="script-element" style="${style}">${content}</${tag}>`;
  });

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidthMM = 210;
  const pageHeightMM = 297;
  const marginMM = 15;
  const contentWidthMM = pageWidthMM - (marginMM * 2);
  const maxContentHeightMM = pageHeightMM - (marginMM * 2.5); // Leave space for header/footer

  // Create a measurement container
  const measureContainer = document.createElement('div');
  measureContainer.style.position = 'absolute';
  measureContainer.style.left = '-9999px';
  measureContainer.style.width = '700px'; // Approx width for A4
  measureContainer.style.padding = '0';
  measureContainer.style.visibility = 'hidden';
  document.body.appendChild(measureContainer);

  const pages: string[][] = [[]];
  let currentPageHeightPX = 0;
  const maxPageHeightPX = 950; // Threshold for content split

  const headerHtml = `
    <div style="border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; width: 100%;">
      <div style="flex: 1;">
        <h1 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 2px 0; font-family: system-ui, sans-serif;">${safeTitle.replace(/</g, '&lt;')}</h1>
        <p style="font-size: 9px; color: #64748b; margin: 0; font-family: system-ui, sans-serif;">Generated via 12Labs Studio • Professional Scripting Platform</p>
      </div>
      <div style="text-align: right; min-width: 80px;">
        <span style="font-size: 12px; font-weight: 900; color: #2563eb; letter-spacing: 0.5px;">12 LABS</span>
      </div>
    </div>
  `;

  const footerHtml = (pageNum: number, total: number) => `
    <div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #94a3b8; width: 100%;">
      <span>© 12Labs AI Studio • Official Export</span>
      <span style="font-weight: 700;">PAGE ${pageNum} OF ${total}</span>
    </div>
  `;

  // Sort elements into pages.
  // Measuring phase gets 0-40% of the progress bar. We yield to the browser
  // every 25 lines so this loop never blocks the main thread long enough to
  // feel like a "hang" — the tab stays fully responsive during export.
  for (let li = 0; li < htmlLines.length; li++) {
    const lineHtml = htmlLines[li];
    measureContainer.innerHTML = lineHtml;
    const height = measureContainer.offsetHeight;

    if (currentPageHeightPX + height > maxPageHeightPX && pages[pages.length - 1].length > 0) {
      pages.push([lineHtml]);
      currentPageHeightPX = height;
    } else {
      pages[pages.length - 1].push(lineHtml);
      currentPageHeightPX += height;
    }

    if (li % 25 === 0) {
      onProgress?.(Math.round((li / htmlLines.length) * 40), 'measuring');
      await new Promise(r => setTimeout(r, 0));
    }
  }
  document.body.removeChild(measureContainer);
  onProgress?.(40, 'measuring');

  // Render each page. This phase covers the remaining 40-100% of progress.
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();

    const pageDiv = document.createElement('div');
    pageDiv.style.width = '800px';
    pageDiv.style.padding = '40px 50px';
    pageDiv.style.backgroundColor = '#ffffff';
    pageDiv.style.boxSizing = 'border-box';
    pageDiv.style.fontFamily = "system-ui, -apple-system, sans-serif";
    
    pageDiv.innerHTML = `
      <div style="display: flex; flex-direction: column; min-height: 1050px; justify-content: space-between;">
        <div>
          ${headerHtml}
          <div style="min-height: 850px;">
            ${pages[i].join('')}
          </div>
        </div>
        ${footerHtml(i + 1, pages.length)}
      </div>
    `;

    document.body.appendChild(pageDiv);
    
    const canvas = await html2canvas(pageDiv, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMM, pageHeightMM, undefined, 'FAST');
    
    document.body.removeChild(pageDiv);
    onProgress?.(40 + Math.round(((i + 1) / pages.length) * 60), 'rendering');
    // Tiny delay to allow UI to breathe
    await new Promise(r => setTimeout(r, 10));
  }

  onProgress?.(100, 'rendering');
  const name = filename || `12labs_script_${safeTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
  pdf.save(`${name}.pdf`);
}

export function downloadScriptAsTxt(title: string, rawText: string, filename?: string) {
  if (!rawText) return;
  const safeTitle = title || '12Labs AI Script';
  const name = filename || `12labs_script_${safeTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
  const content = `${safeTitle.toUpperCase()}\nGenerated on 12Labs AI\n${'='.repeat(40)}\n\n${rawText}`;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  saveAs(blob, `${name}.txt`);
}

export async function downloadScriptAsDocx(title: string, rawText: string, filename?: string) {
  if (!rawText) return;

  const lines = rawText.split('\n');
  const paragraphs: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: title || '12Labs AI Script', bold: true, size: 32, color: '0F172A' })],
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Generated on 12Labs AI Studio', italics: true, size: 18, color: '64748B' })],
    }),
    new Paragraph({ children: [new TextRun({ text: '' })] }),
  ];

  for (const line of lines) {
    const l = line.trim();
    if (!l) {
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      continue;
    }

    // Clean inline markdown for DOCX
    const cleanText = l.replace(/\*\*(.*?)\*\*/g, '$1').replace(/###\s*/g, '').replace(/##\s*/g, '').replace(/#\s*/g, '');
    const isHeading = l.startsWith('#') || l.startsWith('**');

    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: cleanText,
            bold: isHeading,
            size: isHeading ? 26 : 22,
            color: '1E293B',
          }),
        ],
      })
    );
  }

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });

  const blob = await Packer.toBlob(doc);
  const safeTitle = title || '12Labs AI Script';
  const name = filename || `12labs_script_${safeTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
  saveAs(blob, `${name}.docx`);
}
