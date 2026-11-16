import React from "react";
import Section from "./section";
import "./About.css";

const About = () => {
  const items = [
    {
      title: "Who We Are",
      subtitle: "Committed to Our Community",
      content:
        "Howrah Bornoporichoy is a registered NGO based in Howrah, Kadamtala, dedicated to bringing happiness to underprivileged individuals and promoting environmental well-being.",
      image: "/images/who-we-are.jpg",
    },
    {
      title: "Our Mission",
      subtitle: "Passionate About Making a Difference",
      content:
        "Our mission is to uplift marginalized communities and contribute to environmental conservation through impactful developmental projects. We strive to create inclusive opportunities and improve lives while promoting sustainability and a greener future.",
      image: "/images/our-mission.jpg",
      reverse: true,
    },
    {
      title: "Our Leadership",
      subtitle: "Led by Visionaries",
      content:
        "Under the leadership of Mr. Souvik Bera, a dedicated team of young professionals designs and implements our projects. Their commitment to professionalism and sustainability drives our efforts to make a lasting difference.",
      image: "/images/our-leadership.jpg",
    },
    {
      title: "Our Approach",
      subtitle: "Driven by Transparency and Volunteerism",
      content:
        "We believe in transparent governance and rely on the support of enthusiastic volunteers to carry out our initiatives. Our projects are focused on community development, environmental conservation, and youth empowerment.",
      image: "/images/our-approach.jpg",
    },
  ];

  const donate = (e) => {
    // Handle the donate button click
  };

  return (
    <>
      <div className="header-content">
        <h1>We are Howrah Bornoporichoy</h1>
        <p>
          At Howrah Bornoporichoy, we are dedicated to uplifting underprivileged
          communities and promoting environmental well-being. Our registered NGO
          operates with transparency, passion, and a commitment to making a
          lasting impact.
        </p>
        <button className="donate-button" onClick={donate}>
          Donate
        </button>
        <img
          src="/images/header-image.png"
          alt="Children smiling"
          className="header-image"
        />
      </div>
      <div>
        {items.map((item, index) => (
          <Section
            key={index}
            title={item.title}
            subtitle={item.subtitle}
            content={item.content}
            image={item.image}
            reverse={item.reverse}
          />
        ))}
      </div>
    </>
  );
};

export default About;
