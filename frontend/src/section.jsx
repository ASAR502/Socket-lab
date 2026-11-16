import React from "react";
import "./Section.css";

const Section = ({ title, subtitle, content, image, reverse }) => {
  return (
    <section className={`section ${reverse ? "reverse" : ""}`}>
      <div className="section-content">
        <h2>{title}</h2>
        <h3>{subtitle}</h3>
        <p>{content}</p>
        <button className="donate-button">Donate</button>
      </div>
      <img src={image} alt={subtitle} className="section-image" />
    </section>
  );
};

export default Section;
