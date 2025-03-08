'use client'

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
          src={props.src}
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
  const [showHtmlDebug, setShowHtmlDebug] = useState(false)
  const [processedMarkdown, setProcessedMarkdown] = useState<
    Record<number, string>
  >({})
  const fileInputRef = useRef<HTMLInputElement>(null)

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
          `!\\[(.*?)\\]\\(${imgId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
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
      setError('Oh honey, I only work with PDF files! Let\'s try again.')
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
        const errorData = await processResponse.json()
        throw new Error(errorData.error || 'Failed to process file')
      }

      const data = await processResponse.json()
      console.log('OCR Response data:', data)

      try {
        // First, check if the text is a JSON string that we need to parse
        let parsedContent
        let contentText = data.text

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
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const toggleViewMode = () => {
    setViewMode(viewMode === 'rendered' ? 'raw' : 'rendered')
  }

  return (
    <div className='w-full space-y-6 mb-12'>
      <div className='space-y-4'>
        <div className='flex flex-col sm:flex-row gap-4'>
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
                file ? 'border-red-400 bg-red-50' : 'border-gray-300'
              }`}
            >
              <div className='text-center py-4'>
                {file ? (
                  <div className='text-red-600 font-semibold'>{file.name}</div>
                ) : (
                  <>
                    <svg
                      className='mx-auto h-10 w-10 text-red-400'
                      fill='none'
                      stroke='currentColor'
                      viewBox='0 0 24 24'
                    >
                      <path
                        strokeLinecap='round'
                        strokeLinejoin='round'
                        strokeWidth={1.5}
                        d='M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
                      />
                    </svg>
                    <p className='mt-2 text-sm text-gray-600'>
                      Click to select your PDF, darling
                    </p>
                  </>
                )}
              </div>
            </div>
          </label>

          <div className='flex gap-2'>
            <button
              onClick={handleUpload}
              disabled={!file || status === 'uploading' || status === 'processing'}
              className={`px-4 py-2 rounded-lg font-medium ${
                !file || status === 'uploading' || status === 'processing'
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-red-600 text-white hover:bg-red-700 transition-colors'
              }`}
            >
              {status === 'uploading' || status === 'processing'
                ? 'Working on it...'
                : 'Let Auntie Read It!'}
            </button>

            <button
              onClick={handleClear}
              disabled={!file && !result}
              className={`px-4 py-2 rounded-lg font-medium ${
                !file && !result
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors'
              }`}
            >
              Start Fresh
            </button>
          </div>
        </div>

        {error && (
          <div className='p-4 bg-red-50 border border-red-200 rounded-lg text-red-700'>
            <div className='font-medium mb-1'>Oh dear! A little hiccup:</div>
            <div>{error}</div>
          </div>
        )}

        {status === 'uploading' && (
          <div className='p-6 text-center'>
            <div className='inline-block animate-spin rounded-full h-8 w-8 border-4 border-red-600 border-t-transparent'></div>
            <p className='mt-3 text-gray-600'>Auntie is warming up her reading glasses...</p>
          </div>
        )}

        {status === 'processing' && (
          <div className='p-6 text-center'>
            <div className='inline-block animate-spin rounded-full h-8 w-8 border-4 border-red-600 border-t-transparent'></div>
            <p className='mt-3 text-gray-600'>Just a moment, sweetie! Auntie is reading through your document...</p>
          </div>
        )}

        {result && (
          <div className='space-y-4 w-full'>
            <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2'>
              <h3 className='text-xl font-medium text-red-600'>Auntie's Analysis</h3>
              <div className='flex items-center gap-2 flex-wrap'>
                <p className='text-xs bg-red-50 text-red-600 px-3 py-1 rounded-full font-medium border border-red-100'>
                  Analysis complete, sweetie!
                </p>
              </div>
            </div>

            <Tabs defaultValue='content' className='w-full'>
              <TabsList className='mb-2 bg-red-50 p-1 rounded-md'>
                <TabsTrigger 
                  value='content' 
                  className='data-[state=active]:bg-red-600 data-[state=active]:text-white'
                >
                  Document Content
                </TabsTrigger>
                <TabsTrigger 
                  value='chat'
                  className='data-[state=active]:bg-red-600 data-[state=active]:text-white'
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
                    {viewMode === 'rendered' ? 'View Raw Text' : 'View Rendered'}
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
                      {displayMode === 'paginated' ? 'Show Combined' : 'Show Pages'}
                    </Button>
                  )}
                </div>

                {viewMode === 'raw' ? (
                  <Textarea
                    value={result.text}
                    readOnly
                    className='h-[500px] font-mono text-sm'
                  />
                ) : (
                  <div className='bg-white border rounded-md p-4 max-h-[80vh] h-[500px] overflow-auto'>
                    {result.pages && result.pages.length > 0 ? (
                      displayMode === 'paginated' ? (
                        // Paginated view
                        result.pages.map((page, index) => {
                          return (
                            <div
                              key={index}
                              className='mb-8 pb-8 border-b last:border-b-0'
                            >
                              <div className='bg-gray-50 p-2 mb-2 text-sm text-gray-500 rounded'>
                                Page {page.index + 1}
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
                <div className='p-4 bg-red-50 border border-red-100 rounded-md text-red-700 text-sm mb-4'>
                  <p className='font-medium'>Ask Auntie About Your Document</p>
                  <p>
                    Need to know something specific? Just ask me, honey! 
                    I'll search through your document and find just what you need.
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
