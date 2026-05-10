import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// THE POLICY CONTRACT.
// One schema per document type. This file = "what does an NHS travel
// & subsistence policy contain that we want to query later?"
// Other parsers (events, routes) will get their own schema files.

export const PolicyRules = z.object({
  policyTitle: z.string(),
  policyVersion: z.string(),
  issuingTrust: z.string(),

  mileageRates: z
    .array(
      z.object({
        vehicleType: z.string().describe("e.g. 'private', 'lease'"),
        ratePerMile: z.string().describe("e.g. '45p' or 'HMRC guidelines'"),
        passengerSupplement: z.string().nullable(),
      }),
    )
    .describe("Local mileage rates; reimbursed for excess miles only"),

  excessMileageRule: z
    .string()
    .describe(
      "How claimable mileage is calculated, e.g. total minus home-to-base round trip",
    ),

  accommodationEligibility: z.array(
    z.object({
      context: z.string().describe("e.g. 'training', 'business travel'"),
      rule: z.string().describe("e.g. '>1hr from home AND event >1 day'"),
    }),
  ),

  approvalRules: z.array(
    z.object({
      expenseType: z
        .string()
        .describe("e.g. 'general', 'overseas travel', 'exceptions'"),
      approver: z.string().describe("Role required to authorise"),
    }),
  ),

  bookingProcess: z.object({
    bookingSystem: z
      .string()
      .nullable()
      .describe("e.g. 'Redfern via admin team'"),
    leadTimeWeeks: z.number().nullable(),
    claimDeadlineDays: z.number().nullable(),
  }),

  unhandled: z
    .array(
      z.object({
        topic: z.string(),
        rawText: z.string(),
      }),
    )
    .describe("Anything in the document that didn't fit the schema above — captured here for review rather than silently dropped"),
});

export type PolicyRules = z.infer<typeof PolicyRules>;

export const policyRulesTool = {
  name: "report_policy_rules",
  description:
    "Use this tool to return the structured policy rules you have extracted " +
    "from this NHS travel and subsistence document. Always call this tool — " +
    "do not reply with free text. If something in the document doesn't fit " +
    "the schema, put it in `unhandled` rather than dropping it.",
  input_schema: z.toJSONSchema(PolicyRules) as Anthropic.Tool.InputSchema,
};
