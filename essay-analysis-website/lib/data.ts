import { parseBrat } from "./parse-brat"
import type { Experiment } from "./types"

// The full essay text (reconstructed from annotation spans)
const essay1Text = `Some people think that when immigrants move to a new country, they should follow the customs and traditions of the new country. However, others feel that immigrants should keep their own customs and traditions. Discuss both views and give your opinion.

Some people thought that they should follow the local customs in order to integrate into their adopted countries' cultures. However, I believe that they are able to sustain their cultural identities and doing so help they keep their origin values.

First and foremost, maintaining one's cultural identity is a key important rule to help individuals emerge in the new multicultural environments. Take Australia for example, immigrants from varieties of nations have a day called multicultural day where people from each country prepare their food and traditional activities for displaying in the public venues. Many Australians come this day to enjoy the shows, learn about the cultures and admire the diverse values. These feedbacks, in turn, help raise one's pride of their cultures and help people understand each other more.

In addition, aside from maintaining cultural identities for social integration, it is crucial to keep one's identity for they need a connection back to their country as well as teach their children their value of origin. For instance, children immigrated to a new country will face social troubles in school with new friends. In this new environment, parent should find friends coming from their same country so that they can socialize in a very familiar manner as feeling being home. Fail to create this familiarity makes them felt isolated, in the extreme can lead to social disorder like autism.

In conclusion, while some may argue that immigrants should adapt to local customs, I firmly believe that maintaining one's cultural identity is essential for both social integration and personal well-being.`

// Ground truth annotations (from your file)
const groundTruthBrat = `T1	MajorClaim 391 490	they are able to sustain their cultural identities and doing so help they keep their origin values.
T2	Claim 235 358	Some people thought that they should follow the local customs in order to integrate into their adopted countries' cultures.
T3	Claim 500 625	maintaining one's cultural identity is a key important rule to help individuals emerge in the new multicultural environments.
T4	Premise 626 840	Take Australia for example, immigrants from varieties of nations have a day called multicultural day where people from each country prepare their food and traditional activities for displaying in the public venues.
T5	Premise 841 947	Many Australians come this day to enjoy the shows, learn about the cultures and admire the diverse values.
T6	Premise 948 1058	These feedbacks, in turn, help raise one's pride of their cultures and help people understand each other more.
T7	Claim 1168 1308	it is crucial to keep one's identity for they need a connection back to their country as well as teach their children their value of origin.
T8	Premise 1309 1413	For instance, children immigrated to a new country will face social troubles in school with new friends.
T9	Premise 1414 1572	In this new environment, parent should find friends coming from their same country so that they can socialize in a very familiar manner as feeling being home.
T10	Premise 1573 1686	Fail to create this familiarity makes them felt isolated, in the extreme can lead to social disorder like autism.
A1	Stance T2 Against
A2	Stance T3 For
A3	Stance T7 For
R1	supports Arg1:T3 Arg2:T1
R2	supports Arg1:T4 Arg2:T3
R3	supports Arg1:T5 Arg2:T3
R4	supports Arg1:T6 Arg2:T3
R5	supports Arg1:T7 Arg2:T1
R6	supports Arg1:T8 Arg2:T7
R7	supports Arg1:T9 Arg2:T7
R8	supports Arg1:T10 Arg2:T7
R9	attacks Arg1:T1 Arg2:T2`

// --- Add your LLM model outputs below. Just paste the BRAT text. ---

// TODO: Replace these with your actual model BRAT outputs.
// Currently using ground truth as placeholder for all three models.
const claudeOpus45Brat = `T1	MajorClaim 391 490	they are able to sustain their cultural identities and doing so help they keep their origin values.
T2	Claim 235 358	Some people thought that they should follow the local customs in order to integrate into their adopted countries' cultures.
T3	Claim 500 625	maintaining one's cultural identity is a key important rule to help individuals emerge in the new multicultural environments.
T4	Premise 626 840	Take Australia for example, immigrants from varieties of nations have a day called multicultural day where people from each country prepare their food and traditional activities for displaying in the public venues.
T5	Premise 841 947	Many Australians come this day to enjoy the shows, learn about the cultures and admire the diverse values.
T6	Premise 948 1058	These feedbacks, in turn, help raise one's pride of their cultures and help people understand each other more.
T7	Claim 1168 1308	it is crucial to keep one's identity for they need a connection back to their country as well as teach their children their value of origin.
T8	Premise 1309 1413	For instance, children immigrated to a new country will face social troubles in school with new friends.
T9	Premise 1414 1572	In this new environment, parent should find friends coming from their same country so that they can socialize in a very familiar manner as feeling being home.
T10	Premise 1573 1686	Fail to create this familiarity makes them felt isolated, in the extreme can lead to social disorder like autism.
A1	Stance T2 Against
A2	Stance T3 For
A3	Stance T7 For
R1	supports Arg1:T3 Arg2:T1
R2	supports Arg1:T4 Arg2:T3
R3	supports Arg1:T5 Arg2:T3
R4	supports Arg1:T6 Arg2:T3
R5	supports Arg1:T7 Arg2:T1
R6	supports Arg1:T8 Arg2:T7
R7	supports Arg1:T9 Arg2:T7
R8	supports Arg1:T10 Arg2:T7
R9	attacks Arg1:T1 Arg2:T2`

const gemini25Brat = `T1	MajorClaim 391 490	they are able to sustain their cultural identities and doing so help they keep their origin values.
T2	Claim 235 358	Some people thought that they should follow the local customs in order to integrate into their adopted countries' cultures.
T3	Claim 500 625	maintaining one's cultural identity is a key important rule to help individuals emerge in the new multicultural environments.
T4	Premise 626 840	Take Australia for example, immigrants from varieties of nations have a day called multicultural day where people from each country prepare their food and traditional activities for displaying in the public venues.
T5	Premise 841 947	Many Australians come this day to enjoy the shows, learn about the cultures and admire the diverse values.
T6	Premise 948 1058	These feedbacks, in turn, help raise one's pride of their cultures and help people understand each other more.
T7	Claim 1168 1308	it is crucial to keep one's identity for they need a connection back to their country as well as teach their children their value of origin.
T8	Premise 1309 1413	For instance, children immigrated to a new country will face social troubles in school with new friends.
T9	Premise 1414 1572	In this new environment, parent should find friends coming from their same country so that they can socialize in a very familiar manner as feeling being home.
T10	Premise 1573 1686	Fail to create this familiarity makes them felt isolated, in the extreme can lead to social disorder like autism.
A1	Stance T2 Against
A2	Stance T3 For
A3	Stance T7 For
R1	supports Arg1:T3 Arg2:T1
R2	supports Arg1:T4 Arg2:T3
R3	supports Arg1:T5 Arg2:T3
R4	supports Arg1:T6 Arg2:T3
R5	supports Arg1:T7 Arg2:T1
R6	supports Arg1:T8 Arg2:T7
R7	supports Arg1:T9 Arg2:T7
R8	supports Arg1:T10 Arg2:T7
R9	attacks Arg1:T1 Arg2:T2`

const gpt52Brat = `T1	MajorClaim 391 490	they are able to sustain their cultural identities and doing so help they keep their origin values.
T2	Claim 235 358	Some people thought that they should follow the local customs in order to integrate into their adopted countries' cultures.
T3	Claim 500 625	maintaining one's cultural identity is a key important rule to help individuals emerge in the new multicultural environments.
T4	Premise 626 840	Take Australia for example, immigrants from varieties of nations have a day called multicultural day where people from each country prepare their food and traditional activities for displaying in the public venues.
T5	Premise 841 947	Many Australians come this day to enjoy the shows, learn about the cultures and admire the diverse values.
T6	Premise 948 1058	These feedbacks, in turn, help raise one's pride of their cultures and help people understand each other more.
T7	Claim 1168 1308	it is crucial to keep one's identity for they need a connection back to their country as well as teach their children their value of origin.
T8	Premise 1309 1413	For instance, children immigrated to a new country will face social troubles in school with new friends.
T9	Premise 1414 1572	In this new environment, parent should find friends coming from their same country so that they can socialize in a very familiar manner as feeling being home.
T10	Premise 1573 1686	Fail to create this familiarity makes them felt isolated, in the extreme can lead to social disorder like autism.
A1	Stance T2 Against
A2	Stance T3 For
A3	Stance T7 For
R1	supports Arg1:T3 Arg2:T1
R2	supports Arg1:T4 Arg2:T3
R3	supports Arg1:T5 Arg2:T3
R4	supports Arg1:T6 Arg2:T3
R5	supports Arg1:T7 Arg2:T1
R6	supports Arg1:T8 Arg2:T7
R7	supports Arg1:T9 Arg2:T7
R8	supports Arg1:T10 Arg2:T7
R9	attacks Arg1:T1 Arg2:T2`

// Build the experiment data structure
export const experiments: Experiment[] = [
  {
    id: "exp-1",
    name: "Argument Mining with Simple Prompting",
    description:
      "Evaluating different LLMs on argument mining from persuasive essays using a simple zero-shot prompt. The task involves identifying argument components (Major Claims, Claims, Premises), their stances, and relations (support/attack).",
    method: "Simple prompt (zero-shot)",
    essays: [
      {
        id: "essay-1",
        title: "Cultural Identity of Immigrants",
        text: essay1Text,
        groundTruth: parseBrat(groundTruthBrat),
        modelResults: [
          {
            modelName: "Claude Opus 4.5",
            modelId: "claude-opus-4.5",
            annotation: parseBrat(claudeOpus45Brat),
            // Add scores here later, e.g.:
            // scores: { "F1": 0.92, "Precision": 0.95, "Recall": 0.89 }
          },
          {
            modelName: "Gemini 2.5",
            modelId: "gemini-2.5",
            annotation: parseBrat(gemini25Brat),
            // scores: { "F1": 0.87, "Precision": 0.90, "Recall": 0.84 }
          },
          {
            modelName: "GPT-5.2",
            modelId: "gpt-5.2",
            annotation: parseBrat(gpt52Brat),
            // scores: { "F1": 0.90, "Precision": 0.92, "Recall": 0.88 }
          },
        ],
      },
      // --- Add more essays below. Just copy the structure above. ---
      // Example second essay (placeholder - replace with your actual data):
      {
        id: "essay-2",
        title: "Technology in Education",
        text: `In today's rapidly evolving world, technology has become an integral part of education. Some argue that technology enhances the learning experience, while others believe it can be a distraction.

Proponents of technology in education claim that digital tools make learning more interactive and engaging. For instance, online platforms allow students to access a wealth of resources and collaborate with peers globally. Interactive simulations can bring abstract scientific concepts to life, making them easier to understand. Moreover, educational apps can personalize learning paths to suit individual student needs.

However, critics argue that excessive reliance on technology can hinder the development of critical thinking and social skills. Students may become overly dependent on search engines rather than developing their own analytical abilities. Furthermore, screen time has been linked to attention problems in young learners. The digital divide also means that not all students have equal access to technology, potentially widening educational inequalities.

In conclusion, while technology offers significant benefits in education, it should be implemented thoughtfully, with a balance between digital and traditional learning methods to ensure holistic development.`,
        groundTruth: parseBrat(`T1	MajorClaim 192 280	technology enhances the learning experience, while others believe it can be a distraction
T2	Claim 282 367	digital tools make learning more interactive and engaging
T3	Premise 369 466	online platforms allow students to access a wealth of resources and collaborate with peers globally
T4	Premise 468 579	Interactive simulations can bring abstract scientific concepts to life, making them easier to understand
T5	Premise 590 679	educational apps can personalize learning paths to suit individual student needs
T6	Claim 690 801	excessive reliance on technology can hinder the development of critical thinking and social skills
T7	Premise 803 910	Students may become overly dependent on search engines rather than developing their own analytical abilities
T8	Premise 923 995	screen time has been linked to attention problems in young learners
T9	Premise 997 1113	The digital divide also means that not all students have equal access to technology, potentially widening educational inequalities
A1	Stance T2 For
A2	Stance T6 Against
R1	supports Arg1:T2 Arg2:T1
R2	supports Arg1:T3 Arg2:T2
R3	supports Arg1:T4 Arg2:T2
R4	supports Arg1:T5 Arg2:T2
R5	attacks Arg1:T6 Arg2:T1
R6	supports Arg1:T7 Arg2:T6
R7	supports Arg1:T8 Arg2:T6
R8	supports Arg1:T9 Arg2:T6`),
        modelResults: [
          {
            modelName: "Claude Opus 4.5",
            modelId: "claude-opus-4.5",
            annotation: parseBrat(`T1	MajorClaim 192 280	technology enhances the learning experience, while others believe it can be a distraction
T2	Claim 282 367	digital tools make learning more interactive and engaging
T3	Premise 369 466	online platforms allow students to access a wealth of resources and collaborate with peers globally
T4	Premise 468 579	Interactive simulations can bring abstract scientific concepts to life, making them easier to understand
T5	Premise 590 679	educational apps can personalize learning paths to suit individual student needs
T6	Claim 690 801	excessive reliance on technology can hinder the development of critical thinking and social skills
T7	Premise 803 910	Students may become overly dependent on search engines rather than developing their own analytical abilities
T8	Premise 923 995	screen time has been linked to attention problems in young learners
T9	Premise 997 1113	The digital divide also means that not all students have equal access to technology, potentially widening educational inequalities
A1	Stance T2 For
A2	Stance T6 Against
R1	supports Arg1:T2 Arg2:T1
R2	supports Arg1:T3 Arg2:T2
R3	supports Arg1:T4 Arg2:T2
R4	supports Arg1:T5 Arg2:T2
R5	attacks Arg1:T6 Arg2:T1
R6	supports Arg1:T7 Arg2:T6
R7	supports Arg1:T8 Arg2:T6
R8	supports Arg1:T9 Arg2:T6`),
          },
          {
            modelName: "Gemini 2.5",
            modelId: "gemini-2.5",
            annotation: parseBrat(`T1	MajorClaim 192 280	technology enhances the learning experience, while others believe it can be a distraction
T2	Claim 282 367	digital tools make learning more interactive and engaging
T3	Premise 369 466	online platforms allow students to access a wealth of resources and collaborate with peers globally
T4	Premise 468 579	Interactive simulations can bring abstract scientific concepts to life, making them easier to understand
T5	Premise 590 679	educational apps can personalize learning paths to suit individual student needs
T6	Claim 690 801	excessive reliance on technology can hinder the development of critical thinking and social skills
T7	Premise 803 910	Students may become overly dependent on search engines rather than developing their own analytical abilities
T8	Premise 923 995	screen time has been linked to attention problems in young learners
A1	Stance T2 For
A2	Stance T6 Against
R1	supports Arg1:T2 Arg2:T1
R2	supports Arg1:T3 Arg2:T2
R3	supports Arg1:T4 Arg2:T2
R4	supports Arg1:T5 Arg2:T2
R5	attacks Arg1:T6 Arg2:T1
R6	supports Arg1:T7 Arg2:T6
R7	supports Arg1:T8 Arg2:T6`),
          },
          {
            modelName: "GPT-5.2",
            modelId: "gpt-5.2",
            annotation: parseBrat(`T1	MajorClaim 192 280	technology enhances the learning experience, while others believe it can be a distraction
T2	Claim 282 367	digital tools make learning more interactive and engaging
T3	Premise 369 466	online platforms allow students to access a wealth of resources and collaborate with peers globally
T4	Premise 468 579	Interactive simulations can bring abstract scientific concepts to life, making them easier to understand
T5	Premise 590 679	educational apps can personalize learning paths to suit individual student needs
T6	Claim 690 801	excessive reliance on technology can hinder the development of critical thinking and social skills
T7	Premise 803 910	Students may become overly dependent on search engines rather than developing their own analytical abilities
T8	Premise 923 995	screen time has been linked to attention problems in young learners
T9	Premise 997 1113	The digital divide also means that not all students have equal access to technology, potentially widening educational inequalities
A1	Stance T2 For
A2	Stance T6 Against
R1	supports Arg1:T2 Arg2:T1
R2	supports Arg1:T3 Arg2:T2
R3	supports Arg1:T4 Arg2:T2
R4	supports Arg1:T5 Arg2:T2
R5	attacks Arg1:T6 Arg2:T1
R6	supports Arg1:T7 Arg2:T6
R7	supports Arg1:T8 Arg2:T6
R8	supports Arg1:T9 Arg2:T6`),
          },
        ],
      },
    ],
  },
]
