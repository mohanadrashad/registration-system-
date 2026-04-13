import { Button } from "@/components/ui/button";
import { Calendar, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function EventNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="mx-auto max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div className="rounded-full bg-muted p-4">
            <Calendar className="h-12 w-12 text-muted-foreground" />
          </div>
        </div>

        <h1 className="mb-2 text-2xl font-bold tracking-tight">
          Event not found
        </h1>

        <p className="mb-6 text-muted-foreground">
          The event you are looking for does not exist or has been deleted.
        </p>

        <Button variant="default" asChild>
          <Link href="/dashboard/events">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Events
          </Link>
        </Button>
      </div>
    </div>
  );
}
