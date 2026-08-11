import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

function textItemsToLines(items) {
  const lines = [];
  for (const item of items || []) {
    const text = String(item?.str || '').trim();
    if (!text) continue;
    const x = Number(item?.transform?.[4]) || 0;
    const y = Number(item?.transform?.[5]) || 0;
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push({ x, text });
  }
  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) =>
      line.items
        .sort((left, right) => left.x - right.x)
        .map((item) => item.text)
        .join(' '),
    )
    .join('\n');
}

export async function extractPdfPages(arrayBuffer) {
  const loadingTask = getDocument({ data: new Uint8Array(arrayBuffer) });
  try {
    const pdf = await loadingTask.promise;
    const pageLimit = Math.min(pdf.numPages, 250);
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      pages.push({ pageNumber, text: textItemsToLines(textContent.items) });
      page.cleanup();
    }
    // Giữ tổng số trang thật để lớp tách trang có thể cảnh báo khi bị giới hạn.
    pages.totalPages = pdf.numPages;
    return pages;
  } catch (error) {
    if (error?.name === 'PasswordException') {
      throw new Error('PDF đang được bảo vệ bằng mật khẩu. Vui lòng mở khóa file trước khi tải lên.');
    }
    throw new Error(`Không thể đọc PDF: ${error?.message || 'file không hợp lệ'}`);
  } finally {
    await loadingTask.destroy();
  }
}
