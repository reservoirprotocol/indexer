import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const operatorUpdated: EventData = {
  kind: "operator-filter",
  subKind: "operator-filter-operator-updated",
  topic: "0x2738289d9deecdc30eb8ffc42876633caecca1ffa166e4efa89f408e17373a1a",
  numTopics: 4,
  abi: new Interface([
    `event OperatorUpdated(
      address indexed registrant,
      address indexed operator,
      bool indexed filtered
    )`,
  ]),
};

export const operatorsUpdated: EventData = {
  kind: "operator-filter",
  subKind: "operator-filter-operators-updated",
  topic: "0x02b85afdacb82d5512c6f05566b3018677ffcbd7e5f75e498bc64081131cbd6c",
  numTopics: 3,
  abi: new Interface([
    `event OperatorsUpdated(
      address indexed registrant,
      address[] operators,
      bool indexed filtered
    )`,
  ]),
};

export const subscriptionUpdated: EventData = {
  kind: "operator-filter",
  subKind: "operator-filter-subscription-updated",
  topic: "0x0038c54977604f1a5c0a3604cbbecd0153c81e3131799ead95755e8bb5d5b9e8",
  numTopics: 4,
  abi: new Interface([
    `event SubscriptionUpdated(
      address indexed registrant,
      address indexed subscription,
      bool indexed subscribed
    )`,
  ]),
};
