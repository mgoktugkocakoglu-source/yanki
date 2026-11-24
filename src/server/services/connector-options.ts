import type { ConnectorOption } from "@/components/forms/project-form";
import { isConnectorUsable, listConnectors } from "../collectors/registry";

/** Proje formunda gösterilen bağlayıcı seçenekleri. */
export function connectorOptions(): ConnectorOption[] {
  return listConnectors().map((connector) => ({
    id: connector.descriptor.id,
    name: connector.descriptor.name,
    summary: connector.descriptor.summary,
    terms: connector.descriptor.terms,
    personalOnly: connector.descriptor.access === "personal-only",
    allowed: isConnectorUsable(connector),
    missingSetting: connector.isConfigured() ? null : (connector.descriptor.requiredSetting ?? null),
    metered: connector.descriptor.metered === true,
  }));
}
