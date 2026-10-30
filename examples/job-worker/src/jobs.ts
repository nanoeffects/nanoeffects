// The events of the email domain. This file imports no bus.
import { createAction, createJob } from "nanoeffects/actions";
import type { Email } from "./mailer";

// createJob — a command that also sends the outcomes: email/send/pending, /success, /fail, /cancel.
// It has no handler here: the worker binds one.
export const sendEmail = createJob<Email, void>("email/send");

// createAction — the worker tells that nothing is queued or running
export const idle = createAction("email/idle");
