"use client";

import { useCallback, useEffect, useState } from "react";
import { Contact, ContactStatus } from "@prisma/client";
import { useDebounce } from "./use-debounce";

interface ContactWithRegistration extends Contact {
  registration?: {
    id: string;
    status: string;
    confirmationCode: string;
  } | null;
}

interface UseContactsOptions {
  eventId: string;
  status?: ContactStatus;
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

interface UseContactsResult {
  contacts: ContactWithRegistration[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage contacts for an event
 */
export function useContacts(options: UseContactsOptions): UseContactsResult {
  const { eventId, status, category, search, page = 1, pageSize = 50 } = options;

  const [contacts, setContacts] = useState<ContactWithRegistration[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Debounce search to avoid too many requests
  const debouncedSearch = useDebounce(search, 300);

  const fetchContacts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (status) params.set("status", status);
      if (category) params.set("category", category);
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const response = await fetch(
        `/api/events/${eventId}/contacts?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch contacts");
      }

      const data = await response.json();
      setContacts(data.contacts || data);
      setTotal(data.total || data.length);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
      setContacts([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [eventId, status, category, debouncedSearch, page, pageSize]);

  useEffect(() => {
    if (eventId) {
      fetchContacts();
    }
  }, [fetchContacts, eventId]);

  return {
    contacts,
    total,
    isLoading,
    error,
    refetch: fetchContacts,
  };
}

/**
 * Hook to fetch a single contact
 */
export function useContact(contactId: string | null) {
  const [contact, setContact] = useState<ContactWithRegistration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchContact = useCallback(async () => {
    if (!contactId) {
      setContact(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/contacts/${contactId}`);

      if (!response.ok) {
        throw new Error("Failed to fetch contact");
      }

      const data = await response.json();
      setContact(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
      setContact(null);
    } finally {
      setIsLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  return {
    contact,
    isLoading,
    error,
    refetch: fetchContact,
  };
}
