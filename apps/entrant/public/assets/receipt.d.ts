import type { PersonReferenceDTO } from '../../app/lib/person.types';

export interface ReceiptEvent {
  eventCode: string;
  discipline: string;
  player: PersonReferenceDTO;
  partner?: PersonReferenceDTO | null;
  state: string;
}

export interface SubmissionReceipt {
  submissionId: string;
  slug?: string | null;
  tournamentName?: string | null;
  orgName?: string | null;
  venueName?: string | null;
  submittedAt: string;
  status: string;
  feeTotalCents?: number | null;
  paymentState: string;
  paymentNote?: string | null;
  paymentInstructions?: string | null;
  events: ReceiptEvent[];
}

export function formatCents(cents: number | null | undefined): string;
export function formatMoment(value: string): string;
export function receiptStatus(status: string): { label: string; tone: string };
export function paymentSummary(receipt: SubmissionReceipt): string;
export function receiptText(receipt: SubmissionReceipt): string;
export function renderReceipt(root: HTMLElement, receipt: SubmissionReceipt): void;
export function loadReceipt(root: HTMLElement, fetchImpl?: typeof fetch): Promise<void>;
