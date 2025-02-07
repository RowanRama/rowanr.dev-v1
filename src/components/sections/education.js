import React, { useState, useEffect, useRef } from 'react';
import { Link, useStaticQuery, graphql } from 'gatsby';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import { GatsbyImage, getImage } from 'gatsby-plugin-image';
import styled from 'styled-components';
import { srConfig } from '@config';
import sr from '@utils/sr';
import { Icon } from '@components/icons';
import { usePrefersReducedMotion } from '@hooks';

const StyledEducationSection = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;

  h2 {
    font-size: clamp(24px, 5vw, var(--fz-heading));
  }

  .education-grid {
    ${({ theme }) => theme.mixins.resetList};
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    grid-gap: 15px;
    position: relative;
    margin-top: 50px;

    @media (max-width: 1080px) {
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    }
  }

  .more-button {
    ${({ theme }) => theme.mixins.button};
    margin: 80px auto 0;
  }
`;

const StyledEducation = styled.li`
  position: relative;
  cursor: default;
  transition: var(--transition);

  @media (prefers-reduced-motion: no-preference) {
    &:hover,
    &:focus-within {
      .education-inner {
        transform: translateY(-7px);
      }
    }
  }

  a {
    position: relative;
    z-index: 1;
  }

  .education-inner {
    ${({ theme }) => theme.mixins.boxShadow};
    ${({ theme }) => theme.mixins.flexBetween};
    flex-direction: column;
    align-items: flex-start;
    position: relative;
    height: 100%;
    padding: 2rem 1.75rem;
    border-radius: var(--border-radius);
    background-color: var(--light-navy);
    transition: var(--transition);
    overflow: auto;
  }

  .education-top {
    ${({ theme }) => theme.mixins.flexBetween};
    margin-bottom: 35px;

    .education-image {
      height: 100px;
      width:150px;
      margin-left: auto;
      margin-right: auto;
    }
  }

  .education-title {
    margin: 0 0 10px;
    color: var(--lightest-slate);
    font-size: var(--fz-xxl);

    a {
      position: static;

      &:before {
        content: '';
        display: block;
        position: absolute;
        z-index: 0;
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
      }
    }
  }

  .education-focus-list {
    display: flex;
    align-items: flex-end;
    flex-grow: 1;
    flex-wrap: wrap;
    padding: 0;
    margin: 20px 0 0 0;
    list-style: none;

    li {
      font-family: var(--font-mono);
      font-size: var(--fz-xxs);
      line-height: 1.75;

      &:not(:last-of-type) {
        margin-right: 15px;
      }
    }
  }
`;


const Education = () => {
  const data = useStaticQuery(graphql`
    query {
      education: allMarkdownRemark(
        filter: { fileAbsolutePath: { regex: "/content/education/" } }
        sort: { fields: [frontmatter___date], order: DESC }
      ) {
        edges {
          node {
            frontmatter {
              degree
              school
              logo {
                childImageSharp {
                  gatsbyImageData(width: 100, placeholder: BLURRED, formats: [AUTO, WEBP, AVIF])
                }
              }
              range
              result
              location
              url
              focus
            }
            html
          }
        }
      }
    }
  `);

  const educationData = data.education.edges;
  const revealContainer = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    sr.reveal(revealContainer.current, srConfig());
  }, []);

  const educationInner = node => {
    const { frontmatter, html } = node;
    const { degree, school, logo, range, result, location, url, focus } = frontmatter;
    const image = getImage(logo);
    
    return (
      <div className="education-inner">
        <header>
            <div className="education-top">
                <div className="education-image">
                    <a href={url}>
                        <GatsbyImage image={image} alt={school} className="img" />
                    </a>
                </div>
                <h4 className="education-date">
                    {range}
                </h4>
            </div>
        </header>
        <footer>
            <h3 className="education-title">
                {degree} @ {school}
            </h3>
            <h4 className="education-result">
                {result}
            </h4>
            <h4 className="education-location">
                {location}
            </h4>
        
       
          {focus && (
            <ul className="education-focus-list">
              {focus.map((focus, i) => (
                <li key={i}>{focus}</li>
              ))}
            </ul>
          )}
        </footer>
      </div>
    )
  }

  return (
    <StyledEducationSection id="education" ref={revealContainer}>
        <h2 className="numbered-heading">Where I Studied</h2>

        <ul className="education-grid">
            {educationData &&
                educationData.map(({ node }, i) => (
                <StyledEducation key={i}>{educationInner(node)}</StyledEducation>
            ))}
        </ul>
    </StyledEducationSection>
  );
};

export default Education;
