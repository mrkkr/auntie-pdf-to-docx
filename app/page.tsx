import { OCRDocumentProcessor } from '@/components/ocr-document'

export default function OCRDocumentPage() {
  return (
    <div className='container mx-auto py-10 px-4'>
      <div className='max-w-4xl mx-auto'>
        <div className='mb-8 text-center'>
          <h1 className='text-3xl md:text-5xl font-bold mb-4 text-red-600'>
            Welcome to Auntie PDF!
          </h1>
          <p className='text-xl text-gray-700 max-w-2xl mx-auto'>
            Your all-knowing guide that unpacks every PDF into clear, actionable insights. 
            Just like your favorite aunt, but for documents!
          </p>
        </div>

        <div className='bg-white rounded-xl shadow-md p-6 md:p-8 border border-red-200'>
          <div className='mb-4 text-center'>
            <h2 className='text-xl font-semibold text-red-600 mb-2'>Upload Your PDF</h2>
            <p className='text-gray-600 italic'>
              "Honey, let me take a look at that document for you!"
            </p>
          </div>
          <OCRDocumentProcessor />
        </div>

        <div className='mt-8 grid gap-6 md:grid-cols-2'>
          <div className='bg-red-50 rounded-lg p-5 border border-red-100 shadow-sm'>
            <h3 className='font-medium text-red-800 mb-2 text-lg'>How Auntie Helps</h3>
            <p className='text-red-700'>
              I'll extract all that important text from your PDF documents while 
              keeping everything organized, just like I do with family recipes! 
              I'm powered by top-notch OCR technology, darling.
            </p>
          </div>
          
          <div className='bg-amber-50 rounded-lg p-5 border border-amber-100 shadow-sm'>
            <h3 className='font-medium text-amber-800 mb-2 text-lg'>Auntie's Tips</h3>
            <p className='text-amber-700'>
              For best results, make sure your PDFs are not password protected. 
              And remember, I work best with documents that have clear text - 
              just like how I prefer my gossip!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
