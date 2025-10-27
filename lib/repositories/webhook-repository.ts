import type { Database } from "@/types/supabase";
import { BaseRepository } from "./base-repository";

type WebhookConfiguration =
  Database["public"]["Tables"]["webhook_configurations"]["Row"];
type WebhookConfigurationInsert =
  Database["public"]["Tables"]["webhook_configurations"]["Insert"];
type WebhookDelivery =
  Database["public"]["Tables"]["webhook_deliveries"]["Row"];
type WebhookDeliveryInsert =
  Database["public"]["Tables"]["webhook_deliveries"]["Insert"];

/**
 * Repository for webhook configurations and deliveries
 */
export class WebhookRepository extends BaseRepository {
  /**
   * Get all active webhooks for an organization
   */
  async getActiveWebhooksForOrganization(
    organizationId: string,
  ): Promise<WebhookConfiguration[]> {
    const { data, error } = await this.supabase
      .from("webhook_configurations")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    if (error) throw new Error(`Failed to fetch webhooks: ${error.message}`);
    return data || [];
  }

  /**
   * Get webhook by ID
   */
  async getWebhookById(id: string): Promise<WebhookConfiguration | null> {
    const { data, error } = await this.supabase
      .from("webhook_configurations")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch webhook: ${error.message}`);
    }
    return data;
  }

  /**
   * Create a new webhook configuration
   */
  async createWebhook(
    webhook: WebhookConfigurationInsert,
  ): Promise<WebhookConfiguration> {
    const { data, error } = await this.supabase
      .from("webhook_configurations")
      .insert(webhook)
      .select()
      .single();

    if (error) throw new Error(`Failed to create webhook: ${error.message}`);
    return data;
  }

  /**
   * Update webhook configuration
   */
  async updateWebhook(
    id: string,
    updates: Partial<WebhookConfigurationInsert>,
  ): Promise<WebhookConfiguration> {
    const { data, error } = await this.supabase
      .from("webhook_configurations")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update webhook: ${error.message}`);
    return data;
  }

  /**
   * Delete webhook configuration
   */
  async deleteWebhook(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("webhook_configurations")
      .delete()
      .eq("id", id);

    if (error) throw new Error(`Failed to delete webhook: ${error.message}`);
  }

  /**
   * Create a webhook delivery record
   */
  async createWebhookDelivery(
    delivery: WebhookDeliveryInsert,
  ): Promise<WebhookDelivery> {
    const { data, error } = await this.supabase
      .from("webhook_deliveries")
      .insert(delivery)
      .select()
      .single();

    if (error)
      throw new Error(`Failed to create webhook delivery: ${error.message}`);
    return data;
  }

  /**
   * Update a webhook delivery
   */
  async updateWebhookDelivery(
    id: string,
    updates: Partial<WebhookDeliveryInsert>,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("webhook_deliveries")
      .update(updates)
      .eq("id", id);

    if (error)
      throw new Error(`Failed to update webhook delivery: ${error.message}`);
  }

  /**
   * Get webhook deliveries for a configuration
   */
  async getWebhookDeliveries(webhookConfigurationId: string, limit = 50) {
    const { data, error } = await this.supabase
      .from("webhook_deliveries")
      .select("*")
      .eq("webhook_configuration_id", webhookConfigurationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error)
      throw new Error(`Failed to fetch webhook deliveries: ${error.message}`);
    return data || [];
  }

  /**
   * Retry a failed webhook delivery
   */
  async retryWebhookDelivery(deliveryId: string) {
    const { data, error } = await this.supabase
      .from("webhook_deliveries")
      .select(
        `
        *,
        webhook_configurations(*)
      `,
      )
      .eq("id", deliveryId)
      .single();

    if (error)
      throw new Error(`Failed to fetch delivery for retry: ${error.message}`);
    return data;
  }

  /**
   * Get webhooks matching a trigger type for an organization/project
   */
  async getWebhooksForTrigger(
    triggerType: string,
    organizationId: string,
    projectId?: string,
  ) {
    let query = this.supabase
      .from("webhook_configurations")
      .select(
        `
        *,
        webhook_triggers!inner(*)
      `,
      )
      .eq("enabled", true)
      .eq("organization_id", organizationId)
      .eq("webhook_triggers.trigger_type", triggerType);

    if (projectId) {
      query = query.or(`project_id.eq.${projectId},project_id.is.null`);
    } else {
      query = query.is("project_id", null);
    }

    const { data, error } = await query;

    if (error)
      throw new Error(`Failed to fetch webhooks for trigger: ${error.message}`);
    return data || [];
  }

  /**
   * Get deliveries ready for retry
   */
  async getDeliveriesForRetry(maxAttempts = 3) {
    const { data, error } = await this.supabase
      .from("webhook_deliveries")
      .select(
        `
        *,
        webhook_configurations!inner(*)
      `,
      )
      .eq("status", "retrying")
      .lte("next_retry_at", new Date().toISOString())
      .lt("attempt_count", maxAttempts);

    if (error)
      throw new Error(`Failed to fetch deliveries for retry: ${error.message}`);
    return data || [];
  }

  /**
   * Create webhook triggers
   */
  async createWebhookTriggers(
    webhookId: string,
    triggerTypes: string[],
  ): Promise<void> {
    if (triggerTypes.length === 0) return;

    const triggerInserts = triggerTypes.map((triggerType) => ({
      webhook_id: webhookId,
      trigger_type: triggerType,
    }));

    const { error } = await this.supabase
      .from("webhook_triggers")
      .insert(triggerInserts);

    if (error)
      throw new Error(`Failed to create webhook triggers: ${error.message}`);
  }

  /**
   * Get webhooks for multiple organizations with triggers
   */
  async getWebhooksForOrganizations(organizationIds: string[]) {
    if (organizationIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from("webhook_configurations")
      .select(
        `
        *,
        webhook_triggers(*)
      `,
      )
      .in("organization_id", organizationIds)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch webhooks: ${error.message}`);
    return data || [];
  }

  /**
   * Log webhook delivery
   */
  async logWebhookDelivery(delivery: {
    webhook_configuration_id: string;
    webhook_trigger_id: string | null;
    payload: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    status: string;
    response_code: number;
    response_body: string;
    error_message: string | null;
    attempt_count: number;
    max_attempts: number;
    delivered_at: string | null;
  }): Promise<void> {
    const { error } = await this.supabase
      .from("webhook_deliveries")
      .insert(delivery);

    if (error)
      throw new Error(`Failed to log webhook delivery: ${error.message}`);
  }
}
