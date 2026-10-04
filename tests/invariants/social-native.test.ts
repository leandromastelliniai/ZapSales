import { describe, expect, it } from "vitest";
import { sql } from "./gov-helpers";
describe("social identity schema", () => {
  it("separates numeric social IDs from phones and scopes uniqueness to the organization", () => {
    sql(`insert into organizations (id, slug, legal_name, display_name) values
      ('10000000-0000-4000-8000-000000000001','social-a','Social A','Social A'),
      ('10000000-0000-4000-8000-000000000002','social-b','Social B','Social B');
      insert into contacts (organization_id, social_identity) values
      ('10000000-0000-4000-8000-000000000001','instagram:account:12345'),
      ('10000000-0000-4000-8000-000000000002','instagram:account:12345');`);
    expect(sql("select count(*) from contacts where social_identity = 'instagram:account:12345' and phone_number is null and wa_identity is null")).toBe("2");
    expect(() => sql("insert into contacts (organization_id, social_identity) values ('10000000-0000-4000-8000-000000000001','instagram:account:12345')")).toThrow();
  });

  it("the removed social-network credential table is gone (migration 0534)", () => {
    expect(sql("select to_regclass('public.channel_integrations') is null")).toBe("t");
  });
});
