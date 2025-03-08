import { OCRDocumentProcessor } from '@/components/ocr-document'

export default function OCRDocumentPage() {
  return (
    <main className='container mx-auto py-10 px-4'>
      <div className='max-w-3xl mx-auto'>
        <div className='mb-8 text-center'>
          <h1 className='text-3xl md:text-4xl font-bold mb-4'>
            OCR Document Processor
          </h1>
          <p className='text-lg text-gray-600'>
            Upload PDF documents and extract text content using Mistral OCR
            technology. Process complex layouts, tables, and multi-column text
            with high accuracy.
          </p>
        </div>

        <div className='bg-white rounded-xl shadow-md p-6 md:p-8'>
          <OCRDocumentProcessor />
        </div>

        <div className='mt-8 bg-blue-50 rounded-lg p-4 border border-blue-100'>
          <h3 className='font-medium text-blue-800 mb-2'>How it works</h3>
          <p className='text-blue-700 text-sm'>
            This tool uses Mistral's OCR API to extract text from PDF documents
            while preserving document structure and formatting. The processed
            content is returned in markdown format, making it easy to display
            and work with the extracted information.
          </p>
        </div>
      </div>
    </main>
  )
}
