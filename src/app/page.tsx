import { CustomerLanding } from "@/features/customer/components/customer-landing";
import { getCustomerProperties } from "@/features/customer/server/property-catalog";

export default async function Home() {
  const properties = await getCustomerProperties();
  return <CustomerLanding properties={properties} />;
}
