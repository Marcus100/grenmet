"use client";

import {
  deleteMySignatureApiV1HrSignatureMeDelete,
  readMySignatureApiV1HrSignatureMeGet,
  readMySignedDocumentsApiV1HrSignedDocumentsMeGet,
  saveMySignatureApiV1HrSignatureMePut,
} from "@barrelsgd/api-client";
import { useQuery } from "@tanstack/react-query";

export const signatureKey = ["hr", "my-signature"];
export const signedDocumentsKey = ["hr", "my-signed-documents"];

export function useSigning() {
  return useQuery({
    queryKey: signatureKey,
    queryFn: () => readMySignatureApiV1HrSignatureMeGet().unwrap(),
    staleTime: 0,
    gcTime: 0,
  });
}

export function useSignedDocuments(page = 1) {
  return useQuery({
    queryKey: [...signedDocumentsKey, page],
    queryFn: () =>
      readMySignedDocumentsApiV1HrSignedDocumentsMeGet({
        query: { page, size: 20 },
      }).unwrap(),
  });
}

export const saveSignature = (imageDataUrl: string) =>
  saveMySignatureApiV1HrSignatureMePut({
    body: { image_data_url: imageDataUrl },
  }).unwrap();

export const deleteSignature = () =>
  deleteMySignatureApiV1HrSignatureMeDelete().unwrap();
