"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";

interface TestWebhookButtonProps {
  webhookId: string;
}

export function TestWebhookButton({ webhookId }: TestWebhookButtonProps) {
  const [testing, setTesting] = useState(false);
  const router = useRouter();

  const handleTest = async () => {
    setTesting(true);

    try {
      console.log("Testing webhook with ID:", webhookId);

      const response = await fetch("/api/webhooks/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookId }),
      });

      console.log("Response status:", response.status);
      console.log("Response ok:", response.ok);

      const data = await response.json();
      console.log("Test response data:", JSON.stringify(data, null, 2));
      console.log("data.success:", data.success);
      console.log("data.error:", data.error);
      console.log("data.statusCode:", data.statusCode);

      if (data.success) {
        alert(
          `✅ Test Successful\n\nWebhook responded with status ${data.statusCode}`,
        );
        // Refresh the page to show the new delivery in the table
        router.refresh();
      } else {
        alert(
          `❌ Test Failed\n\n${data.error || "Failed to send test webhook"}`,
        );
        // Refresh even on failure to show the failed delivery
        router.refresh();
      }
    } catch (error) {
      console.error("Test webhook error:", error);
      alert("❌ Error\n\nFailed to send test webhook");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleTest}
      disabled={testing}
      className="h-9 w-9 p-0"
      title="Test webhook"
    >
      {testing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Send className="h-4 w-4" />
      )}
    </Button>
  );
}
