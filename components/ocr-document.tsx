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
      setError('Please select a file first')
      return
    }

    if (file.type !== 'application/pdf') {
      setError('Only PDF files are supported')
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
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const toggleViewMode = () => {
    setViewMode(viewMode === 'rendered' ? 'raw' : 'rendered')
  }

  return (
    <div className='w-full space-y-6 mb-12'>
      <div className='space-y-2'>
        <label className='block text-sm font-medium'>Upload PDF Document</label>
        <div className='flex items-center space-x-2'>
          <input
            ref={fileInputRef}
            type='file'
            accept='.pdf'
            onChange={handleFileChange}
            className='block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-primary file:text-white
                      hover:file:bg-primary/90
                      cursor-pointer'
            disabled={status === 'uploading' || status === 'processing'}
          />
        </div>
        {file && (
          <p className='text-sm text-gray-500 mt-1'>
            Selected file: {file.name} ({(file.size / 1024 / 1024).toFixed(2)}{' '}
            MB)
          </p>
        )}
      </div>

      <div className='flex space-x-2'>
        <Button
          onClick={handleUpload}
          disabled={!file || status === 'uploading' || status === 'processing'}
          className='flex-1'
        >
          {status === 'uploading'
            ? 'Uploading...'
            : status === 'processing'
            ? 'Processing...'
            : 'Process Document'}
        </Button>
        <Button
          onClick={handleClear}
          variant='outline'
          disabled={
            (!file && !result) ||
            status === 'uploading' ||
            status === 'processing'
          }
        >
          Clear
        </Button>
      </div>

      {(status === 'uploading' || status === 'processing') && (
        <div className='p-4 bg-blue-50 border border-blue-100 rounded-md text-blue-700 text-sm'>
          {status === 'uploading'
            ? 'Uploading your document to the OCR service...'
            : 'Processing your document with OCR technology. This may take a moment...'}
        </div>
      )}

      {error && (
        <div className='p-3 rounded-md bg-red-50 border border-red-200 text-red-700'>
          <p className='font-medium'>Error</p>
          <p className='text-sm'>{error}</p>
        </div>
      )}

      {result && (
        <div className='space-y-4 w-full'>
          <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2'>
            <h3 className='text-lg font-medium'>Document Processing Results</h3>
            <div className='flex items-center gap-2 flex-wrap'>
              <p className='text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full'>
                Processing complete
              </p>
            </div>
          </div>

          <Tabs defaultValue='content' className='w-full'>
            <TabsList className='mb-2'>
              <TabsTrigger value='content'>Document Content</TabsTrigger>
              <TabsTrigger value='chat'>Ask Questions</TabsTrigger>
            </TabsList>

            <TabsContent value='content' className='space-y-4'>
              <div className='flex items-center gap-2 justify-end'>
                <Button onClick={toggleViewMode} variant='outline' size='sm'>
                  {viewMode === 'rendered' ? 'View Raw Text' : 'View Rendered'}
                </Button>
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
              <div className='p-4 bg-blue-50 border border-blue-100 rounded-md text-blue-700 text-sm mb-4'>
                <p className='font-medium'>Document Understanding</p>
                <p>
                  Ask questions about your document in natural language. The AI
                  will analyze the content and provide relevant answers.
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
  )
}
