import type { ImgHTMLAttributes } from "react";
import { useQuery } from "@tanstack/react-query";
import { extractDriveFileId, readPrivatePhoto } from "@/lib/drive.functions";
import { getAccessToken } from "@/lib/app-access";

export function PrivatePhoto({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const fileId = extractDriveFileId(src);
  const photo = useQuery({
    queryKey: ["private-photo", fileId],
    queryFn: () => readPrivatePhoto({ data: { token: getAccessToken(), fileId: fileId! } }),
    enabled: !!fileId,
    staleTime: 60_000,
    gcTime: 60_000,
    retry: false,
  });
  if (fileId && !photo.data)
    return (
      <span
        className={props.className}
        role="img"
        aria-label={photo.isError ? "Photo unavailable" : "Loading photo"}
      />
    );
  return <img {...props} alt={alt} src={fileId ? photo.data : src} />;
}
