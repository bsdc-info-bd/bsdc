/**
 * Launch configuration.
 *
 * The commercial launch date is owned by the administrator in the config app
 * (`site_config.launch_date`) and the `launched` flag flips the site to live
 * mode. Until the Supabase data layer lands in Response 3, the home page reads
 * this build-time default, which the config value will override.
 */
export const DEFAULT_LAUNCH_DATE = '2026-02-21T00:00:00+06:00';

export interface LaunchConfig {
  launchDate: string;
  launched: boolean;
}

export const launchConfig: LaunchConfig = {
  launchDate: DEFAULT_LAUNCH_DATE,
  launched: false,
};
