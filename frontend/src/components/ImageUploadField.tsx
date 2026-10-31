import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { getAssetUrl, uploadImageFile, formatApiErrorMessage } from "@/lib/queryClient";
import {
  Upload,
  ImageIcon,
  Loader2,
  X,
  AlertCircle,
  Link as LinkIcon,
  CheckCircle2,
  Trash2,
} from "lucide-react";

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  required?: boolean;
  helpText?: string;
  placeholder?: string;
  className?: string;
}

export default function ImageUploadField({
  label,
  value,
  onChange,
  required = false,
  helpText = "Supports JPEG, PNG, or WebP up to 10MB",
  placeholder = "e.g. /assets/... or https://...",
  className = "",
}: ImageUploadFieldProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileProcess = async (file: File) => {
    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(10);

    try {
      const uploadedUrl = await uploadImageFile(file, (percent) => {
        setUploadProgress(Math.max(10, percent));
      });
      onChange(uploadedUrl);
      setShowUrlInput(false);
    } catch (err: any) {
      console.error("Image upload failed:", err);
      setUploadError(formatApiErrorMessage(err));
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <Label className="text-xs sm:text-sm font-medium text-[#342824] dark:text-foreground">
          {label} {required && <span className="text-[#B66F72]">*</span>}
        </Label>
        {!value && (
          <button
            type="button"
            onClick={() => setShowUrlInput(!showUrlInput)}
            className="text-[11px] text-[#B66F72] dark:text-primary hover:underline flex items-center gap-1"
          >
            <LinkIcon className="h-3 w-3" />
            <span>{showUrlInput ? "Upload File" : "Paste URL"}</span>
          </button>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
      />

      {/* Uploading Progress */}
      {isUploading && (
        <div className="p-3.5 rounded-xl border border-[#B66F72]/30 bg-[#B66F72]/5 dark:bg-primary/5 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#B66F72] dark:text-primary font-medium">
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Uploading image directly to storage...
            </span>
            <span>{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-1.5" />
        </div>
      )}

      {/* Upload Error Banner */}
      {uploadError && !isUploading && (
        <div className="p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setUploadError(null)}
            className="h-6 w-6 p-0 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* If Value is present -> Show Preview Card */}
      {value ? (
        <div className="p-3 rounded-xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={getAssetUrl(value)}
              alt="Uploaded preview"
              className="w-14 h-14 rounded-lg object-cover border border-[#E6D8D0] dark:border-border shrink-0 bg-stone-50"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/placeholders/placeholder.png";
              }}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Image Attached</span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate max-w-[200px] sm:max-w-xs mt-0.5">
                {value}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-xs h-8 px-2.5 border-[#E6D8D0] dark:border-border hover:bg-[#F1E6DF] dark:hover:bg-muted"
            >
              <Upload className="h-3.5 w-3.5 mr-1 text-[#B66F72]" />
              <span>Change</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange("");
                setShowUrlInput(false);
              }}
              disabled={isUploading}
              className="text-xs h-8 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              title="Remove Image"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : showUrlInput ? (
        /* Manual URL input fallback */
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="border-[#E6D8D0] dark:border-border text-xs rounded-lg"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Paste a direct image URL or toggle back to upload from your device.
          </p>
        </div>
      ) : (
        /* Direct Upload Dropzone */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 sm:p-5 text-center cursor-pointer transition-all ${
            isDragging
              ? "border-[#B66F72] bg-[#B66F72]/10"
              : "border-[#E6D8D0] dark:border-border hover:border-[#B66F72]/60 hover:bg-[#FBF7F3] dark:hover:bg-muted/40"
          } ${isUploading ? "pointer-events-none opacity-50" : ""}`}
        >
          <div className="flex flex-col items-center justify-center gap-1.5">
            <div className="w-10 h-10 rounded-full bg-[#B66F72]/10 dark:bg-primary/10 flex items-center justify-center text-[#B66F72] dark:text-primary mb-1">
              <Upload className="h-5 w-5" />
            </div>
            <p className="text-xs sm:text-sm font-medium text-[#342824] dark:text-foreground">
              Click to choose image or drag & drop here
            </p>
            <p className="text-[11px] text-muted-foreground">{helpText}</p>
          </div>
        </div>
      )}
    </div>
  );
}
