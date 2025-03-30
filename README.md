# Auntie PDF - PDF to DOCX Converter

A command-line tool that converts PDF documents into well-formatted DOCX files while preserving structure and formatting. Based on Auntie PDF done by https://github.com/btahir.

## Features

- **Smart PDF Parsing**: Extract text and structure from PDF documents
- **Format Preservation**: Maintains headings, lists, and text styles
- **Image Support**: Includes images from the PDF in the output DOCX
- **Intelligent Formatting**: Detects and preserves:
  - Multiple heading levels
  - Bullet lists
  - Bold and italic text
  - Document structure

## Technology

Auntie PDF leverages:

- **Mistral OCR**: For powerful PDF parsing capabilities
- **docx**: For creating properly formatted DOCX files
- **TypeScript**: For type-safe code execution

## Getting Started

### Environment Variables

Create a `.env.local` file in the root directory with:

```
MISTRAL_API_KEY="your_mistral_api_key"
```

You can obtain a Mistral API key by signing up at [Mistral AI's platform](https://mistral.ai/).

### Installation

```bash
npm install
```

### Usage

Convert a PDF file to DOCX:

```bash
npm run process-pdf /path/to/your/file.pdf
```

Optionally specify output path:

```bash
npm run process-pdf /path/to/your/file.pdf /desired/output/path.docx
```

## License

[MIT](https://github.com/btahir/auntie-pdf/blob/main/LICENSE)

## Acknowledgments

- Powered by Mistral's OCR technology
