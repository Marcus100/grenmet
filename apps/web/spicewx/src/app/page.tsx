import { Alerts } from "@/components/alerts";
import { GmsNewsDesktop, GmsNewsMobile } from "@/components/gms-news";
import { News } from "@/components/news";
import {
  WeatherHomeDesktop,
  WeatherHomeMobile,
} from "@/components/weather-home";

export default function HomePage() {
  return (
    <div>
      {/* <Alerts /> */}

      <div className="lg:hidden">
        <Alerts />
      </div>

      {/* Weather forecast */}
      <div className="hidden px-4 py-6 lg:block">
        <WeatherHomeDesktop />
      </div>
      <div className="lg:hidden">
        <WeatherHomeMobile />
      </div>

      {/* GMS updates */}
      <div className="hidden px-4 py-6 lg:block">
        <GmsNewsDesktop />
      </div>
      <div className="lg:hidden">
        <GmsNewsMobile />
      </div>

      <News />
    </div>
  );
}
