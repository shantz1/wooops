"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import {
  Bold,
  Italic,
  Code,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Redo,
  Undo,
  Type,
  Strikethrough,
  Underline,
  Heading2,
  Heading3,
} from "lucide-react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { sanitizeHtml, isSafeUrl } from "@/lib/sanitize-html";
import { Field } from "./field";
import { cn } from "cn";

interface RichTextEditorProps {
  label: string;
  value: string;
  onChange: (html: string) => void;
  error?: string;
  help?: string;
  disabled?: boolean;
  minHeight?: string;
}

type ToolbarMode = "visual" | "html";

export function RichTextEditor({
  label,
  value,
  onChange,
  error,
  help,
  disabled = false,
  minHeight = "12rem",
}: RichTextEditorProps) {
  const [mode, setMode] = useState<ToolbarMode>("visual");
  const [htmlDraft, setHtmlDraft] = useState({ value, text: value });
  const htmlText = htmlDraft.value === value ? htmlDraft.text : value;
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState("");
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [imageInput, setImageInput] = useState("");
  const [imageAltInput, setImageAltInput] = useState("");
  const [imageError, setImageError] = useState("");
  const [showImageDialog, setShowImageDialog] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false },
      }),
      Image,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: sanitizeHtml(value || ""),
    editorProps: { attributes: { role: "textbox", "aria-label": label, "aria-multiline": "true", style: `min-height: ${minHeight}; outline: none;` } },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const sanitized = sanitizeHtml(html);
      onChange(sanitized);
      setHtmlDraft({ value: sanitized, text: sanitized });
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (!editor) return;

    const currentHtml = editor.getHTML();
    const sanitizedCurrentHtml = sanitizeHtml(currentHtml);
    const sanitizedValue = sanitizeHtml(value || "");

    if (sanitizedValue !== sanitizedCurrentHtml) {
      editor.commands.setContent(sanitizedValue, { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  // Focus link input when dialog opens
  useEffect(() => {
    if (showLinkDialog && linkInputRef.current) {
      linkInputRef.current.focus();
    }
  }, [showLinkDialog]);

  // Focus image input when dialog opens
  useEffect(() => {
    if (showImageDialog && imageInputRef.current) {
      imageInputRef.current.focus();
    }
  }, [showImageDialog]);

  if (!editor) return null;

  const handleLinkApply = () => {
    if (!linkInput.trim()) {
      setLinkError("URL is required");
      return;
    }
    if (!isSafeUrl(linkInput, "link")) {
      setLinkError('Use a link starting with http://, https://, mailto: or tel:.');
      return;
    }
    editor.commands.setLink({ href: linkInput });
    setLinkInput("");
    setLinkError("");
    setShowLinkDialog(false);
  };

  const handleLinkRemove = () => {
    editor.commands.unsetLink();
    setLinkInput("");
    setLinkError("");
    setShowLinkDialog(false);
  };

  const handleLinkCancel = () => {
    setLinkInput("");
    setLinkError("");
    setShowLinkDialog(false);
  };

  const handleImageApply = () => {
    if (!imageInput.trim()) {
      setImageError("Image URL is required");
      return;
    }
    if (!isSafeUrl(imageInput, "image")) {
      setImageError("Use an image URL starting with http://, https:// or /.");
      return;
    }
    editor.commands.setImage({ src: imageInput, alt: imageAltInput });
    setImageInput("");
    setImageAltInput("");
    setImageError("");
    setShowImageDialog(false);
  };

  const handleImageCancel = () => {
    setImageInput("");
    setImageAltInput("");
    setImageError("");
    setShowImageDialog(false);
  };

  const handleHtmlModeToggle = () => {
    if (mode === "visual") {
      setMode("html");
      setHtmlDraft({ value, text: editor.getHTML() });
    } else {
      // Switch back to visual
      const sanitized = sanitizeHtml(htmlText);
      editor.commands.setContent(sanitized, { emitUpdate: false });
      onChange(sanitized);
      setMode("visual");
    }
  };

  const handleHtmlTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setHtmlDraft({ value, text: e.target.value });
  };

  const handleHtmlTextBlur = () => {
    const sanitized = sanitizeHtml(htmlText);
    onChange(sanitized);
  };

  return (
    <Field label={label} help={help} error={error}>
      {(props) => (
        <div
          className="flex flex-col gap-0 border-b-2 border-input"
          {...props}
        >
          {/* Toolbar */}
          <div
            role="toolbar"
            aria-label="Formatting"
            className="flex flex-wrap gap-1 border-b-2 border-input px-1 py-2"
          >
            {/* Text formatting */}
            <ToolbarButton
              icon={Bold}
              label="Bold"
              pressed={editor.isActive("bold")}
              onClick={() => editor.commands.toggleBold()}
              disabled={disabled}
            />
            <ToolbarButton
              icon={Italic}
              label="Italic"
              pressed={editor.isActive("italic")}
              onClick={() => editor.commands.toggleItalic()}
              disabled={disabled}
            />
            <ToolbarButton
              icon={Underline}
              label="Underline"
              pressed={editor.isActive("underline")}
              onClick={() => editor.commands.toggleUnderline()}
              disabled={disabled}
            />
            <ToolbarButton
              icon={Strikethrough}
              label="Strikethrough"
              pressed={editor.isActive("strike")}
              onClick={() => editor.commands.toggleStrike()}
              disabled={disabled}
            />

            <div className="w-px bg-border" />

            {/* Headings */}
            <ToolbarButton
              icon={Heading2}
              label="Heading 2"
              pressed={editor.isActive("heading", { level: 2 })}
              onClick={() => editor.commands.toggleHeading({ level: 2 })}
              disabled={disabled}
            />
            <ToolbarButton
              icon={Heading3}
              label="Heading 3"
              pressed={editor.isActive("heading", { level: 3 })}
              onClick={() => editor.commands.toggleHeading({ level: 3 })}
              disabled={disabled}
            />
            <ToolbarButton
              icon={Type}
              label="Paragraph"
              pressed={editor.isActive("paragraph")}
              onClick={() => editor.commands.setParagraph()}
              disabled={disabled}
            />

            <div className="w-px bg-border" />

            {/* Lists */}
            <ToolbarButton
              icon={List}
              label="Bullet list"
              pressed={editor.isActive("bulletList")}
              onClick={() => editor.commands.toggleBulletList()}
              disabled={disabled}
            />
            <ToolbarButton
              icon={ListOrdered}
              label="Numbered list"
              pressed={editor.isActive("orderedList")}
              onClick={() => editor.commands.toggleOrderedList()}
              disabled={disabled}
            />
            <ToolbarButton
              icon={Quote}
              label="Quote"
              pressed={editor.isActive("blockquote")}
              onClick={() => editor.commands.toggleBlockquote()}
              disabled={disabled}
            />
            <ToolbarButton
              icon={Code}
              label="Code block"
              pressed={editor.isActive("codeBlock")}
              onClick={() => editor.commands.toggleCodeBlock()}
              disabled={disabled}
            />

            <div className="w-px bg-border" />

            {/* Alignment */}
            <ToolbarButton
              icon={AlignLeft}
              label="Align left"
              pressed={editor.isActive({ textAlign: "left" })}
              onClick={() => editor.commands.setTextAlign("left")}
              disabled={disabled}
            />
            <ToolbarButton
              icon={AlignCenter}
              label="Align center"
              pressed={editor.isActive({ textAlign: "center" })}
              onClick={() => editor.commands.setTextAlign("center")}
              disabled={disabled}
            />
            <ToolbarButton
              icon={AlignRight}
              label="Align right"
              pressed={editor.isActive({ textAlign: "right" })}
              onClick={() => editor.commands.setTextAlign("right")}
              disabled={disabled}
            />

            <div className="w-px bg-border" />

            {/* Link */}
            <ToolbarButton
              icon={LinkIcon}
              label="Link"
              pressed={editor.isActive("link")}
              onClick={() => setShowLinkDialog(true)}
              disabled={disabled}
            />

            {/* Image */}
            <ToolbarButton
              icon={ImageIcon}
              label="Image"
              onClick={() => setShowImageDialog(true)}
              disabled={disabled}
            />

            {/* Table */}
            <ToolbarButton
              icon={TableIcon}
              label="Table"
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run()
              }
              disabled={disabled}
            />

            <div className="w-px bg-border" />

            {/* Undo/Redo */}
            <ToolbarButton
              icon={Undo}
              label="Undo"
              onClick={() => editor.commands.undo()}
              disabled={disabled || !editor.can().undo()}
            />
            <ToolbarButton
              icon={Redo}
              label="Redo"
              onClick={() => editor.commands.redo()}
              disabled={disabled || !editor.can().redo()}
            />

            <div className="w-px bg-border" />

            {/* Clear formatting */}
            <ToolbarButton
              label="Clear formatting"
              onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
              disabled={disabled}
            >
              Clear
            </ToolbarButton>

            {/* HTML toggle */}
            <ToolbarButton
              label="HTML"
              pressed={mode === "html"}
              onClick={handleHtmlModeToggle}
              disabled={disabled}
            >
              HTML
            </ToolbarButton>
          </div>

          {/* Content area */}
          {mode === "visual" ? (
            <div
              className={cn(
                "px-3 py-2 border-b border-input focus-within:border-primary",
                disabled && "opacity-50 cursor-not-allowed"
              )}
              style={{ minHeight }}
            >
              <EditorContent
                editor={editor}
                className="rich-text-editor prose prose-sm max-w-none"
              />
            </div>
          ) : (
            <textarea
              value={htmlText}
              onChange={handleHtmlTextChange}
              onBlur={handleHtmlTextBlur}
              disabled={disabled}
              className={cn(
                "font-mono text-sm px-3 py-2 border-b border-input resize-y focus-visible:outline-none focus-visible:border-primary",
                disabled && "opacity-50 cursor-not-allowed"
              )}
              style={{ minHeight }}
            />
          )}

          {/* Link dialog */}
          {showLinkDialog && mode === "visual" && (
            <div className="flex gap-2 border-b border-input px-2 py-2">
              <input
                ref={linkInputRef}
                type="text"
                placeholder="Enter URL (http://, https://, mailto:, tel:, or /)"
                value={linkInput}
                onChange={(e) => {
                  setLinkInput(e.target.value);
                  setLinkError("");
                }}
                className="flex-1 rounded border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={handleLinkApply}
                className="rounded border border-input px-2 py-1 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={handleLinkRemove}
                className="rounded border border-input px-2 py-1 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={handleLinkCancel}
                className="rounded border border-input px-2 py-1 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Cancel
              </button>
              {linkError && (
                <div className="text-xs text-destructive py-1">{linkError}</div>
              )}
            </div>
          )}

          {/* Image dialog */}
          {showImageDialog && mode === "visual" && (
            <div className="flex flex-col gap-2 border-b border-input px-2 py-2">
              <input
                ref={imageInputRef}
                type="text"
                placeholder="Enter image URL (http://, https://, or /)"
                value={imageInput}
                onChange={(e) => {
                  setImageInput(e.target.value);
                  setImageError("");
                }}
                className="rounded border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                type="text"
                placeholder="Alt text (optional)"
                value={imageAltInput}
                onChange={(e) => setImageAltInput(e.target.value)}
                className="rounded border border-input bg-transparent px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleImageApply}
                  className="rounded border border-input px-2 py-1 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={handleImageCancel}
                  className="rounded border border-input px-2 py-1 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Cancel
                </button>
              </div>
              {imageError && (
                <div className="text-xs text-destructive">{imageError}</div>
              )}
            </div>
          )}
        </div>
      )}
    </Field>
  );
}

interface ToolbarButtonProps {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  pressed?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

function ToolbarButton({
  icon: Icon,
  label,
  pressed = false,
  onClick,
  disabled = false,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative rounded px-2 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:bg-accent",
        pressed
          ? "text-primary border-b-2 border-primary font-medium"
          : "text-foreground"
      )}
    >
      {Icon && <Icon className="size-4 inline" />}
      {children}
    </button>
  );
}
