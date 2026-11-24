export { QuerySyntaxError } from "./ast";
export type {
  CompareOp,
  FieldName,
  FieldNode,
  NearNode,
  QueryNode,
  TextNode,
} from "./ast";
export { FIELD_SPECS } from "./fields";
export { EMPTY_FIELDS, findHighlights, matchQuery } from "./matcher";
export type { MatchableFields, MatchResult, TokenRange } from "./matcher";
export { parseQuery, tryParseQuery } from "./parser";
export type { ParseOutcome } from "./parser";
export { buildCollectionPlan } from "./plan";
export type { CollectionPlan } from "./plan";
export { compileToSql } from "./sql";
export type { SqlFragment } from "./sql";
export { composeQuery, decomposeQuery, describeQuery, languageLabel, plainFromSearch, QUERY_LANGUAGES, queryToTopicTerms, splitTerms, topicTermsToQuery } from "./plain";
export type { PlainQuery, QueryDescription } from "./plain";
