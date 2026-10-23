"use client";

import { COMMUNITY_LABEL, type CommunityBoard, type PlateStanding } from "@/lib/community";

function Row({ plate, detail, onOpen }: { plate: PlateStanding; detail: string; onOpen?: (plate: PlateStanding) => void }) {
  return <li>
    <strong>{plate.title}</strong>
    <span>{detail}</span>
    {onOpen && <button type="button" className="text-button" onClick={() => onOpen(plate)}>Open the template</button>}
    {plate.whys.slice(0, 3).map((note) => <small key={note.id}>What was wrong: {note.wrong} Change: {note.change}{note.direction !== "note" && note.ingredientName ? ` Amount: ${note.direction} ${note.ingredientName}.` : ""}</small>)}
  </li>;
}

export function TrendsPage({ board, onOpen }: { board: CommunityBoard | null; onOpen?: (plate: PlateStanding) => void }) {
  return <div className="page-width inner-page trends-page">
    <div className="page-intro">
      <span className="eyebrow">TRENDS</span>
      <h1>How the cook is learning.</h1>
      <p>Reports move a plate up or down the list. A plate is kept even when people dislike it. It leaves the default list only when most people say they will not make it again. Nothing here is a kitchen test.</p>
    </div>
    <p className="subtle-small">{board?.label || COMMUNITY_LABEL}</p>
    {!board ? <p>The cook&apos;s book is not loaded yet.</p> : <>
      <section>
        <h2>Trending well</h2>
        {board.trendingUp.length === 0 ? <p>Nothing is trending well yet.</p> : <ul className="trend-list">{board.trendingUp.map((plate) => <Row key={plate.plateKey} plate={plate} onOpen={onOpen} detail={`${plate.starAverage} stars from ${plate.starPeople} people · ${plate.yesPeople} yes`} />)}</ul>}
      </section>
      <section>
        <h2>Trending poorly</h2>
        {board.trendingDown.length === 0 ? <p>Nothing is trending poorly. Poor reports still stay in the book.</p> : <ul className="trend-list">{board.trendingDown.map((plate) => <Row key={plate.plateKey} plate={plate} onOpen={onOpen} detail={`${plate.lowPeople} poor ${plate.lowPeople === 1 ? "report" : "reports"} · still on the list`} />)}</ul>}
      </section>
      <section>
        <h2>Waiting on a why</h2>
        {board.askWhy.length === 0 ? <p>No plate is waiting on a reason. Three 0 or 1 star reports open this list.</p> : <ul className="trend-list">{board.askWhy.map((plate) => <Row key={plate.plateKey} plate={plate} onOpen={onOpen} detail={`${plate.lowPeople} poor reports, ${plate.whyPeople} reasons so far`} />)}</ul>}
      </section>
      <section>
        <h2>Kept, but not offered</h2>
        <p>These plates are not deleted. A large majority said they will not make them again, so they are not offered first. The reasons stay, in case a similar plate later shows that an amount was the problem.</p>
        {board.shelved.length === 0 ? <p>Nothing has been taken off the default list.</p> : <ul className="trend-list">{board.shelved.map((plate) => <Row key={plate.plateKey} plate={plate} onOpen={onOpen} detail={`${plate.wontPeople} of ${plate.againPeople} said they will not make it again · ${plate.reports} reports kept`} />)}</ul>}
      </section>
      <section>
        <h2>Notices</h2>
        {board.news.length === 0 ? <p>No notices yet.</p> : <ul className="trend-list">{board.news.map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.text}</span></li>)}</ul>}
      </section>
    </>}
  </div>;
}
