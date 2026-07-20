import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, X, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fileToCompressedDataUrl } from "@/lib/photo";
import { toDisplayablePhotoUrl as normalizeDriveUrl } from "@/lib/drive.functions";
import { cn } from "@/lib/utils";

export function PhotoPicker({
  value,
  onChange,
  size = 96,
  className,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  size?: number;
  className?: string;
}) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    try {
      const url = await fileToCompressedDataUrl(file);
      onChange(url);
    } catch {
      toast.error("Could not process image");
    }
  }

  return (
    <>
      <div className={cn("flex items-center gap-4", className)}>
        <button
          type="button"
          onClick={() => (value ? undefined : setCameraOpen(true))}
          className="group relative shrink-0 overflow-hidden rounded-full border-2 border-dashed border-border bg-muted transition-colors hover:border-primary"
          style={{ width: size, height: size }}
          aria-label="Change photo"
        >
          {value ? (
            <img src={value.startsWith("data:") ? value : (normalizeDriveUrl(value) ?? "")} alt="Student" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <User className="h-6 w-6" />
              <span className="text-[10px] font-medium">No Photo</span>
            </div>
          )}
        </button>

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="h-4 w-4" />
              Camera
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => galleryRef.current?.click()}
            >
              <ImageIcon className="h-4 w-4" />
              Gallery
            </Button>
            {value && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onChange(null)}
                className="text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4" />
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Auto-compressed for storage.</p>
        </div>
      </div>

      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add photo</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            <Button
              variant="outline"
              className="h-24 flex-col gap-2"
              onClick={() => {
                setCameraOpen(false);
                cameraRef.current?.click();
              }}
            >
              <Camera className="h-6 w-6" />
              Take Photo
            </Button>
            <Button
              variant="outline"
              className="h-24 flex-col gap-2"
              onClick={() => {
                setCameraOpen(false);
                galleryRef.current?.click();
              }}
            >
              <ImageIcon className="h-6 w-6" />
              From Gallery
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCameraOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
