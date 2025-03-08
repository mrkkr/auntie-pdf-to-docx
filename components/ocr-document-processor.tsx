'use client'

import type React from 'react'

import { useState, useRef, useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'

import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

import 'katex/dist/katex.min.css'

import { DocumentChat } from './document-chat'
import { FileText, Upload, RefreshCw, Coffee } from 'lucide-react'

type ProcessingStatus =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'complete'
  | 'error'

interface OCRPage {
  index: number
  markdown: string
  images?: Array<{
    id: string
    topLeftX?: number
    topLeftY?: number
    bottomRightX?: number
    bottomRightY?: number
    top_left_x?: number
    top_left_y?: number
    bottom_right_x?: number
    bottom_right_y?: number
    imageBase64?: string | null
    image_base64?: string | null
  }>
  dimensions?: {
    dpi: number
    height: number
    width: number
  }
}

interface OCRResponse {
  text: string
  pages?: OCRPage[]
  rawResponse?: any
}

// Create a custom renderer for ReactMarkdown with better LaTeX handling
const customRenderers: Components = {
  img: (props) => {
    // Check if src is a base64 image
    const isBase64 =
      props.src &&
      (props.src.startsWith('data:image/') ||
        props.src.startsWith('data:application/'))

    // If it's a base64 image, render it
    if (isBase64) {
      return (
        <img
          src={props.src || '/placeholder.svg'}
          alt={props.alt || 'Image'}
          className='max-w-full'
        />
      )
    }

    // Otherwise, it's trying to load from a URL - prevent this and show a placeholder
    return (
      <span className='inline-block bg-gray-100 border border-gray-300 p-4 text-center rounded'>
        <span className='text-gray-500'>
          [Image not available: {props.alt}]
        </span>
      </span>
    )
  },
  // Added special handling for math code blocks
  code: (props) => {
    const { className, children } = props
    // If this is a math block (detected by class), don't apply additional formatting
    if (className === 'language-math' || className === 'language-latex') {
      return (
        <code className='overflow-x-auto block max-w-full'>{children}</code>
      )
    }
    // Regular code blocks
    return <code className={className}>{children}</code>
  },
  // Handle pre blocks to ensure code doesn't overflow
  pre: (props) => {
    return (
      <pre
        className='overflow-x-auto whitespace-pre-wrap break-words'
        {...props}
      />
    )
  },
}

// Custom URL transformer function to prevent ReactMarkdown from sanitizing URLs
const urlTransformer = (url: string) => {
  // Important: Make sure we pass through data URLs (base64 encoded images)
  if (url.startsWith('data:')) {
    return url
  }

  // For other URLs, apply default behavior
  return url
}

export function OCRDocumentProcessor() {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<OCRResponse | null>(null)
  const [status, setStatus] = useState<ProcessingStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered')
  const [displayMode, setDisplayMode] = useState<'paginated' | 'combined'>(
    'paginated'
  )
  const [processedMarkdown, setProcessedMarkdown] = useState<
    Record<number, string>
  >({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [documentUrl, setDocumentUrl] = useState<string>('')
  const [inputMethod, setInputMethod] = useState<'file' | 'url'>('file')

  // Process images once when result changes
  useEffect(() => {
    if (!result || !result.pages || result.pages.length === 0) return

    // Process all pages
    const processed: Record<number, string> = {}

    result.pages.forEach((page) => {
      // Skip if no images
      if (!page.images || page.images.length === 0) {
        processed[page.index] = page.markdown
        return
      }

      // Create simple map from image ID to base64 data
      const imageMap: Record<string, string> = {}

      // Process each image object
      page.images.forEach((img) => {
        const base64Data = img.image_base64 || img.imageBase64
        if (
          base64Data &&
          typeof base64Data === 'string' &&
          base64Data.trim() !== ''
        ) {
          // Create data URL
          const imgSrc = base64Data.startsWith('data:')
            ? base64Data
            : `data:image/jpeg;base64,${base64Data}`

          imageMap[img.id] = imgSrc
        }
      })

      // Directly replace each image reference in the markdown
      let processedMarkdown = page.markdown

      // Process each image in the map
      Object.entries(imageMap).forEach(([imgId, base64Data]) => {
        // Look for exact pattern: ![img-id](img-id)
        const exactPattern = `![${imgId}](${imgId})`
        if (processedMarkdown.includes(exactPattern)) {
          processedMarkdown = processedMarkdown.replace(
            new RegExp(
              exactPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              'g'
            ),
            `![${imgId}](${base64Data})`
          )
        }

        // Also try to find any reference that just uses the ID in the URL part
        const regex = new RegExp(
          `!\\[(.*?)\\]\$$${imgId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\$$`,
          'g'
        )
        const matches = [...processedMarkdown.matchAll(regex)]

        if (matches.length > 0) {
          matches.forEach((match) => {
            const [fullMatch, altText] = match
            processedMarkdown = processedMarkdown.replace(
              fullMatch,
              `![${altText}](${base64Data})`
            )
          })
        }
      })

      processed[page.index] = processedMarkdown
    })

    setProcessedMarkdown(processed)
  }, [result])

  // Get combined markdown from all pages
  const getCombinedMarkdown = (): string => {
    if (!result || !result.pages || result.pages.length === 0) {
      return result?.text || ''
    }

    // Use the processed markdown for each page
    const markdowns = result.pages.map((page) => {
      return processedMarkdown[page.index] || page.markdown
    })

    return markdowns.join('\n\n')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null
    setFile(selectedFile)
    setResult(null)
    setError(null)
    setStatus('idle')
    setProcessedMarkdown({})
  }

  const handleUpload = async () => {
    if (!file) {
      setError('Sweetie, you forgot to select a file first!')
      return
    }

    if (file.type !== 'application/pdf') {
      setError("Oh honey, I only work with PDF files! Let's try again.")
      return
    }

    try {
      setStatus('uploading')
      setError(null)

      // Create form data for file upload
      const formData = new FormData()
      formData.append('file', file)

      // Upload the file
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      // Handle 413 Payload Too Large error specifically
      if (uploadResponse.status === 413) {
        throw new Error(
          "Oh my, that PDF is too big for Auntie's reading glasses! Please try a smaller document (under 5MB) or use the url option."
        )
      }

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json()
        throw new Error(errorData.error || 'Failed to upload file')
      }

      const { fileId } = await uploadResponse.json()

      // Process the file with OCR
      setStatus('processing')
      const processResponse = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId }),
      })

      if (!processResponse.ok) {
        const errorData = await processResponse.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to process file')
      }

      // Safely parse the response as JSON
      let data
      try {
        data = await processResponse.json()
      } catch (jsonError) {
        console.error('Failed to parse JSON response:', jsonError)
        if (
          jsonError instanceof SyntaxError &&
          jsonError.message.includes('Unexpected token')
        ) {
          throw new Error(
            "Auntie couldn't make sense of this document. It might be too large or complex for processing."
          )
        }
        throw new Error('Failed to process the document response')
      }

      console.log('OCR Response data:', data)

      try {
        // First, check if the text is a JSON string that we need to parse
        let parsedContent
        const contentText = data.text

        if (
          typeof contentText === 'string' &&
          (contentText.startsWith('{') || contentText.startsWith('['))
        ) {
          try {
            parsedContent = JSON.parse(contentText)
          } catch (e) {
            console.warn('Failed to parse response text as JSON', e)
            parsedContent = null
          }
        }

        // Handle structured data with pages
        if (
          parsedContent &&
          parsedContent.pages &&
          Array.isArray(parsedContent.pages)
        ) {
          console.log('Setting structured result with pages')
          setResult({
            text: contentText,
            pages: parsedContent.pages,
            rawResponse: parsedContent,
          })
        }
        // Handle the sample data format you provided
        else if (data.hasStructuredData && typeof data.text === 'string') {
          try {
            const structuredData = JSON.parse(data.text)
            if (structuredData.pages && Array.isArray(structuredData.pages)) {
              console.log('Setting structured result from API response')
              setResult({
                text: data.text,
                pages: structuredData.pages,
                rawResponse: structuredData,
              })
            } else {
              // Fallback to plain text
              setResult({
                text: data.text,
                pages: [],
              })
            }
          } catch (e) {
            console.error('Error parsing structured data:', e)
            setResult({
              text: data.text,
              pages: [],
            })
          }
        }
        // Handle simple text content
        else {
          console.log('Setting plain text result')
          setResult({
            text: data.text,
            pages: [],
          })
        }
      } catch (err) {
        console.error('Error processing OCR result:', err)
        // Fallback to simple text
        setResult({
          text:
            typeof data.text === 'string' ? data.text : JSON.stringify(data),
          pages: [],
        })
      }

      setStatus('complete')
    } catch (err) {
      console.error('OCR processing error:', err)
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
      setStatus('error')
    }
  }

  const handleClear = () => {
    setFile(null)
    setResult(null)
    setError(null)
    setStatus('idle')
    setProcessedMarkdown({})
    setDocumentUrl('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const toggleViewMode = () => {
    setViewMode(viewMode === 'rendered' ? 'raw' : 'rendered')
  }

  // Add a new function to handle URL submission
  const handleUrlSubmit = async () => {
    if (!documentUrl.trim()) {
      setError('Sweetie, you need to enter a URL first!')
      return
    }

    try {
      setStatus('processing')
      setError(null)

      // Process the URL with the API
      const processResponse = await fetch('/api/process-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: documentUrl }),
      })

      if (!processResponse.ok) {
        const errorData = await processResponse.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to process document URL')
      }

      // Safely parse the response as JSON
      let data
      try {
        data = await processResponse.json()
      } catch (jsonError) {
        console.error('Failed to parse JSON response:', jsonError)
        if (
          jsonError instanceof SyntaxError &&
          jsonError.message.includes('Unexpected token')
        ) {
          throw new Error(
            "Auntie couldn't make sense of this document. It might be too large or complex for processing."
          )
        }
        throw new Error('Failed to process the document response')
      }

      console.log('OCR Response data from URL:', data)

      try {
        // First, check if the text is a JSON string that we need to parse
        let parsedContent
        const contentText = data.text

        if (
          typeof contentText === 'string' &&
          (contentText.startsWith('{') || contentText.startsWith('['))
        ) {
          try {
            parsedContent = JSON.parse(contentText)
          } catch (e) {
            console.warn('Failed to parse response text as JSON', e)
            parsedContent = null
          }
        }

        // Handle structured data with pages
        if (
          parsedContent &&
          parsedContent.pages &&
          Array.isArray(parsedContent.pages)
        ) {
          console.log('Setting structured result with pages from URL')
          setResult({
            text: contentText,
            pages: parsedContent.pages,
            rawResponse: parsedContent,
          })
        }
        // Handle the sample data format
        else if (data.hasStructuredData && typeof data.text === 'string') {
          try {
            const structuredData = JSON.parse(data.text)
            if (structuredData.pages && Array.isArray(structuredData.pages)) {
              console.log('Setting structured result from API response for URL')
              setResult({
                text: data.text,
                pages: structuredData.pages,
                rawResponse: structuredData,
              })
            } else {
              // Fallback to plain text
              setResult({
                text: data.text,
                pages: [],
              })
            }
          } catch (e) {
            console.error('Error parsing structured data from URL:', e)
            setResult({
              text: data.text,
              pages: [],
            })
          }
        }
        // Handle simple text content
        else {
          console.log('Setting plain text result from URL')
          setResult({
            text: data.text,
            pages: [],
          })
        }
      } catch (err) {
        console.error('Error processing OCR result from URL:', err)
        // Fallback to simple text
        setResult({
          text:
            typeof data.text === 'string' ? data.text : JSON.stringify(data),
          pages: [],
        })
      }

      setStatus('complete')
    } catch (err) {
      console.error('OCR processing error for URL:', err)
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
      setStatus('error')
    }
  }

  return (
    <div className='w-full space-y-6 mb-12'>
      <div className='space-y-4'>
        {/* Add tabs for selecting input method */}
        <div className='flex justify-center mb-4'>
          <div className='inline-flex p-1 bg-amber-100 rounded-lg'>
            <button
              onClick={() => setInputMethod('file')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                inputMethod === 'file'
                  ? 'bg-red-500 text-white'
                  : 'text-amber-800 hover:bg-amber-200'
              }`}
            >
              Upload PDF
            </button>
            <button
              onClick={() => setInputMethod('url')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                inputMethod === 'url'
                  ? 'bg-red-500 text-white'
                  : 'text-amber-800 hover:bg-amber-200'
              }`}
            >
              PDF URL
            </button>
          </div>
        </div>

        <div className='flex flex-col sm:flex-row gap-4'>
          {inputMethod === 'file' ? (
            // File upload input - existing code
            <label className='flex-1'>
              <input
                type='file'
                ref={fileInputRef}
                onChange={handleFileChange}
                accept='application/pdf'
                className='hidden'
              />
              <div
                className={`flex items-center justify-center px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors hover:bg-red-50 ${
                  file ? 'border-red-400 bg-red-50' : 'border-amber-300'
                }`}
              >
                <div className='text-center py-6'>
                  {file ? (
                    <div className='flex flex-col items-center'>
                      <FileText className='h-12 w-12 text-red-500 mb-2' />
                      <div className='text-red-600 font-semibold'>
                        {file.name}
                      </div>
                      <div className='text-amber-600 text-sm mt-1'>
                        Ready for Auntie&apos;s review!
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className='relative'>
                        <div className='absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full w-6 h-6 flex items-center justify-center text-xs animate-pulse'>
                          +
                        </div>
                        <div className='bg-amber-100 rounded-lg p-3'>
                          <Upload className='h-10 w-10 text-red-500' />
                        </div>
                      </div>
                      <p className='mt-3 text-amber-700 font-medium'>
                        Click to select your PDF, darling
                      </p>
                      <p className='text-xs text-amber-600 mt-1'>
                        Auntie can&apos;t wait to see what you&apos;ve got!
                      </p>
                    </>
                  )}
                </div>
              </div>
            </label>
          ) : (
            // URL input
            <div className='flex-1'>
              <div
                className={`border-2 rounded-lg transition-colors ${
                  documentUrl ? 'border-red-400 bg-red-50' : 'border-amber-300'
                }`}
              >
                <div className='p-3'>
                  <label className='text-amber-700 font-medium mb-2 block'>
                    Enter a public PDF URL:
                  </label>
                  <input
                    type='url'
                    value={documentUrl}
                    onChange={(e) => setDocumentUrl(e.target.value)}
                    placeholder='https://example.com/document.pdf'
                    className='w-full p-2 border border-amber-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500'
                  />
                  <p className='text-xs text-amber-600 mt-1'>
                    Auntie will fetch it for you, sweetie!
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className='flex gap-2'>
            <button
              onClick={inputMethod === 'file' ? handleUpload : handleUrlSubmit}
              disabled={
                (inputMethod === 'file' &&
                  (!file ||
                    status === 'uploading' ||
                    status === 'processing')) ||
                (inputMethod === 'url' &&
                  (!documentUrl || status === 'processing'))
              }
              className={`px-4 py-2 rounded-lg font-medium flex items-center justify-center min-w-[160px] ${
                (inputMethod === 'file' &&
                  (!file ||
                    status === 'uploading' ||
                    status === 'processing')) ||
                (inputMethod === 'url' &&
                  (!documentUrl || status === 'processing'))
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5'
              }`}
            >
              {status === 'uploading' ? (
                <>
                  <RefreshCw className='h-4 w-4 mr-2 animate-spin' />
                  Uploading...
                </>
              ) : status === 'processing' ? (
                <>
                  <Coffee className='h-4 w-4 mr-2 animate-pulse' />
                  Reading...
                </>
              ) : (
                'Let Auntie Read It!'
              )}
            </button>

            <button
              onClick={handleClear}
              disabled={!file && !result && !documentUrl}
              className={`px-4 py-2 rounded-lg font-medium ${
                !file && !result && !documentUrl
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors border border-amber-300'
              }`}
            >
              Start Fresh
            </button>
          </div>
        </div>

        {error && (
          <div className='p-4 bg-red-50 border-2 border-red-200 rounded-lg text-red-700 relative'>
            <div className='absolute -top-3 -left-3 bg-red-100 rounded-full p-1'>
              <div className='bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center'>
                !
              </div>
            </div>
            <div className='font-medium mb-1 pl-4'>
              Oh dear! A little hiccup:
            </div>
            <div className='pl-4'>{error}</div>
          </div>
        )}

        {status === 'uploading' && (
          <div className='p-6 text-center'>
            <div className='inline-block animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent'></div>
            <p className='mt-3 text-amber-700 font-medium'>
              Auntie is warming up her reading glasses...
            </p>
          </div>
        )}

        {status === 'processing' && (
          <div className='p-6 text-center'>
            <div className='relative inline-block'>
              <div className='animate-spin rounded-full h-16 w-16 border-4 border-red-600 border-t-transparent'></div>
              <div className='absolute inset-0 flex items-center justify-center'>
                <div className='h-8 w-8 bg-amber-100 rounded-full flex items-center justify-center'>
                  <span className='text-red-600 text-xs font-bold'>PDF</span>
                </div>
              </div>
            </div>
            <p className='mt-4 text-amber-700 font-medium'>
              Just a moment, sweetie! Auntie is reading through your document...
            </p>
            <p className='text-amber-600 text-sm italic mt-1'>
              She&apos;s very thorough, you know!
            </p>
          </div>
        )}

        {result && (
          <div className='space-y-4 w-full'>
            <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2'>
              <h3 className='text-xl font-medium text-red-600 font-serif flex items-center'>
                <span className='bg-red-100 text-red-600 rounded-full w-8 h-8 inline-flex items-center justify-center mr-2'>
                  <span className='text-sm'>✓</span>
                </span>
                Auntie&apos;s Analysis
              </h3>
              <div className='flex items-center gap-2 flex-wrap'>
                <p className='text-xs bg-red-100 text-red-600 px-3 py-1 rounded-full font-medium border border-red-200 shadow-sm'>
                  Analysis complete, sweetie!
                </p>
              </div>
            </div>

            <Tabs defaultValue='content' className='w-full'>
              <TabsList className='mb-2 bg-gradient-to-r from-red-50 to-amber-50 p-1 rounded-md'>
                <TabsTrigger
                  value='content'
                  className='data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-600 data-[state=active]:to-red-500 data-[state=active]:text-white'
                >
                  Document Content
                </TabsTrigger>
                <TabsTrigger
                  value='chat'
                  className='data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-600 data-[state=active]:to-red-500 data-[state=active]:text-white'
                >
                  Ask Auntie
                </TabsTrigger>
              </TabsList>

              <TabsContent value='content' className='space-y-4'>
                <div className='flex items-center gap-2 justify-end'>
                  <Button
                    onClick={toggleViewMode}
                    variant='outline'
                    size='sm'
                    className='border-red-200 hover:bg-red-50 text-red-600'
                  >
                    {viewMode === 'rendered'
                      ? 'View Raw Text'
                      : 'View Rendered'}
                  </Button>
                  {result.pages && result.pages.length > 1 && (
                    <Button
                      onClick={() =>
                        setDisplayMode(
                          displayMode === 'paginated' ? 'combined' : 'paginated'
                        )
                      }
                      variant='outline'
                      size='sm'
                      className='border-red-200 hover:bg-red-50 text-red-600'
                    >
                      {displayMode === 'paginated'
                        ? 'Show Combined'
                        : 'Show Pages'}
                    </Button>
                  )}
                </div>

                {viewMode === 'raw' ? (
                  <Textarea
                    value={result.text}
                    readOnly
                    className='h-[700px] font-mono text-sm border-amber-200 focus-visible:ring-red-400'
                  />
                ) : (
                  <div className='bg-white border-2 border-amber-200 rounded-md p-4 max-h-[90vh] h-[800px] overflow-auto shadow-inner'>
                    {result.pages && result.pages.length > 0 ? (
                      displayMode === 'paginated' ? (
                        // Paginated view
                        result.pages.map((page, index) => {
                          return (
                            <div
                              key={index}
                              className='mb-8 pb-8 border-b last:border-b-0'
                            >
                              <div className='bg-amber-50 p-2 mb-2 text-sm text-amber-700 rounded flex items-center'>
                                <div className='bg-amber-200 text-amber-800 rounded-full w-5 h-5 flex items-center justify-center text-xs mr-2'>
                                  {page.index + 1}
                                </div>
                                <span>Page {page.index + 1}</span>
                              </div>
                              <div className='prose prose-sm max-w-none overflow-x-auto'>
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm, remarkMath]}
                                  rehypePlugins={[rehypeKatex]}
                                  components={customRenderers}
                                  urlTransform={urlTransformer}
                                >
                                  {processedMarkdown[page.index] || ''}
                                </ReactMarkdown>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        // Combined view
                        <div className='prose prose-sm max-w-none overflow-x-auto'>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={customRenderers}
                            urlTransform={urlTransformer}
                          >
                            {getCombinedMarkdown()}
                          </ReactMarkdown>
                        </div>
                      )
                    ) : (
                      <div className='prose prose-sm max-w-none overflow-x-auto'>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                          components={customRenderers}
                          urlTransform={urlTransformer}
                        >
                          {processedMarkdown[0] || ''}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value='chat'>
                <div className='p-4 bg-red-50 border-2 border-red-200 rounded-md text-red-700 text-sm mb-4 relative'>
                  <div className='absolute -top-3 -right-3 bg-white rounded-full p-1 shadow-sm'>
                    <div className='bg-red-100 rounded-full p-1'>
                      <div className='bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs'>
                        ?
                      </div>
                    </div>
                  </div>
                  <p className='font-medium mb-1'>
                    Ask Auntie About Your Document
                  </p>
                  <p>
                    Need to know something specific? Just ask me, honey!
                    I&apos;ll search through your document and find just what
                    you need.
                  </p>
                </div>
                <DocumentChat
                  documentContent={getCombinedMarkdown()}
                  isEnabled={status === 'complete'}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}
