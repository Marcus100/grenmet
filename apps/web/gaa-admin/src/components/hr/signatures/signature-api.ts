"use client";

import {
  hrDeleteMySignature,
  hrGetMySignature,
  hrGetMySignedDocuments,
  hrSaveMySignature,
} from "@barrelsgd/api-client";
import { useQuery } from "@tanstack/react-query";

export const signatureKey = ["hr", "my-signature"];
export const signedDocumentsKey = ["hr", "my-signed-documents"];

export function useSigning() {
  return useQuery({
    queryKey: signatureKey,
    queryFn: () => hrGetMySignature().unwrap(),
    staleTime: 0,
    gcTime: 0,
  });
}

export function useSignedDocuments(page = 1) {
  return useQuery({
    queryKey: [...signedDocumentsKey, page],
    queryFn: () =>
      hrGetMySignedDocuments({
        query: { page, size: 20 },
      }).unwrap(),
  });
}

export const saveSignature = (imageDataUrl: string) =>
  hrSaveMySignature({
    body: { image_data_url: imageDataUrl },
  }).unwrap();

export const deleteSignature = () => hrDeleteMySignature().unwrap();
