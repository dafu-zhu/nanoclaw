# PDF Reader

Extract text from PDF files sent in chat or fetched from URLs.

## Commands

```bash
# Extract text from an attachment
pdf-reader /workspace/group/attachments/document.pdf

# Extract text from a URL
pdf-reader fetch https://example.com/paper.pdf

# Show metadata (page count, title, author, etc.)
pdf-reader info /workspace/group/attachments/document.pdf
```

## How PDFs arrive

When someone sends a PDF in chat, it is automatically downloaded to `/workspace/group/attachments/` and the message contains a reference like:

```
[PDF: attachments/document.pdf]
```

Use `pdf-reader /workspace/group/attachments/document.pdf` to read its contents.

## Notes

- Text-based PDFs only. Scanned/image PDFs will return empty text.
- For image-based PDFs, ask the user to send a text version or use agent-browser to view it visually.
- Large PDFs may produce a lot of text — consider asking the user which section they want first.
