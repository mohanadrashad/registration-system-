"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download } from "lucide-react";

export default function BadgeViewPage() {
  const params = useParams();
  const confirmationCode = params.confirmationCode as string;
  const [badgeHtml, setBadgeHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetch(`/api/badges/${confirmationCode}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.text();
      })
      .then(setBadgeHtml)
      .catch(() => setError(true));
  }, [confirmationCode]);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/badges/${confirmationCode}/image`);
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `badge-${confirmationCode}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-6">
            <h2 className="mb-2 text-xl font-bold">Badge Not Found</h2>
            <p className="text-muted-foreground">
              The confirmation code is invalid or the badge has not been generated yet.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!badgeHtml) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <h1 className="text-2xl font-bold">Your E-Badge</h1>
      <div className="rounded-lg shadow-xl overflow-hidden">
        <iframe
          ref={iframeRef}
          srcDoc={badgeHtml}
          className="border-0"
          style={{ width: "360px", height: "560px" }}
          title="E-Badge"
        />
      </div>
      <Button onClick={handleDownload} disabled={downloading}>
        <Download className="mr-2 h-4 w-4" />
        {downloading ? "Preparing..." : "Save Badge as Image"}
      </Button>
    </div>
  );
}
