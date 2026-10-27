"use client";

import { COMMUNITY_LABEL, type CommunityBoard, type PlateStanding } from "@/lib/community";

function Row({ plate, detail, onOpen }: { plate: PlateStanding; detail: string; onOpen?: (plate: PlateStanding) => void }) {
  return <li>
    <strong>{plate.title}</strong>
    <span>{detail}</span>
    {onOpen && <button type="button" className="text-button" onClick={() => onOpen(plate)}>Open current base template</button>}
    {plate.feedbackSummary && <small>{plate.feedbackSummary.cookedDevices} cooked reports · {plate.feedbackSummary.previewDevices} first impressions for this exact version.</small>}
    {plate.feedbackSummary?.requiresReview && <small>Review requested for a doneness, allergen or serious concern. Votes do not verify food safety.</small>}
    {plate.whys.slice(0, 3).map((note) => <small key={note.id}>{note.experience === "cooked" ? "Cooked report" : note.experience === "would-try" ? "First impression" : "Earlier report"}: {note.wrong}{note.change ? ` Suggested review: ${note.change}` : ""}{note.direction !== "note" && note.ingredientName ? ` Amount: ${note.direction} ${note.ingredientName}.` : ""}</small>)}
  </li>;
}

export function TrendsPage({ board, onOpen }: { board: CommunityBoard | null; onOpen?: (plate: PlateStanding) => void }) {
  return <div className="page-width inner-page trends-page">
    <div className="page-intro">
      <span className="eyebrow">TRENDS</span>
      <h1>How the cook is learning.</h1>
      <p>Cooked reports and first impressions are kept separately. Patterns can prompt a review and influence suggestions; they do not establish food safety. Earlier votes and disliked plates stay in the book.</p>
    </div>
    <p className="subtle-small">{board?.label || COMMUNITY_LABEL}</p>
    {board && <p className="subtle-small">Each list shows up to 12 plates and 3 recent reasons per plate. All saved reports stay in the book. Opening a base template uses the current recipe and household servings; it may differ from the reported version. Reports stay attached to their original version.</p>}
    {!board ? <p>The cook&apos;s book is not loaded yet.</p> : <>
      <section>
        <h2>Needs a cooking review</h2>
        <p>Doneness, allergen and serious concerns appear here immediately, even before a plate has enough reports to trend.</p>
        {board.plates.filter((plate) => plate.feedbackSummary?.requiresReview).length === 0 ? <p>No version has a pending cooking concern.</p> : <ul className="trend-list">{board.plates.filter((plate) => plate.feedbackSummary?.requiresReview).slice(0, 12).map((plate) => <Row key={plate.plateKey} plate={plate} onOpen={onOpen} detail={plate.feedbackSummary!.reasonCounts.map((reason) => `${reason.label}: ${reason.cookedDevices} cooked, ${reason.previewDevices} first impressions`).join("; ") || "A historical serious concern remains open for review."} />)}</ul>}
      </section>
      <section>
        <h2>Trending well</h2>
        {board.trendingUp.length === 0 ? <p>Nothing is trending well yet.</p> : <ul className="trend-list">{board.trendingUp.slice(0, 12).map((plate) => <Row key={plate.plateKey} plate={plate} onOpen={onOpen} detail={`${plate.starAverage} stars from ${plate.starPeople} browsers · ${plate.yesPeople} yes`} />)}</ul>}
      </section>
      <section>
        <h2>Trending poorly</h2>
        {board.trendingDown.length === 0 ? <p>Nothing is trending poorly. Poor reports still stay in the book.</p> : <ul className="trend-list">{board.trendingDown.slice(0, 12).map((plate) => <Row key={plate.plateKey} plate={plate} onOpen={onOpen} detail={`${plate.lowPeople} poor ${plate.lowPeople === 1 ? "report" : "reports"} · still on the list`} />)}</ul>}
      </section>
      <section>
        <h2>Waiting on a why</h2>
        {board.askWhy.length === 0 ? <p>No plate is waiting on a reason. Ratings of 0–2 or a negative answer ask what needs to change.</p> : <ul className="trend-list">{board.askWhy.slice(0, 12).map((plate) => <Row key={plate.plateKey} plate={plate} onOpen={onOpen} detail={`${plate.lowPeople} poor reports, ${plate.whyPeople} reasons so far`} />)}</ul>}
      </section>
      <section>
        <h2>Kept, but not offered</h2>
        <p>These plates are not deleted. A large majority said they will not make them again, so they are not offered first. The reasons stay, in case a similar plate later shows that an amount was the problem.</p>
        {board.shelved.length === 0 ? <p>Nothing has been taken off the default list.</p> : <ul className="trend-list">{board.shelved.slice(0, 12).map((plate) => <Row key={plate.plateKey} plate={plate} onOpen={onOpen} detail={`${plate.wontPeople} of ${plate.againPeople} said they will not make it again · ${plate.reports} reports kept`} />)}</ul>}
      </section>
      <section>
        <h2>Notices</h2>
        {board.news.length === 0 ? <p>No notices yet.</p> : <ul className="trend-list">{board.news.slice(0, 20).map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.text}</span></li>)}</ul>}
        {board.news.length > 20 && <p className="subtle-small">Showing the latest 20 notices. Earlier reports remain saved.</p>}
      </section>
    </>}
  </div>;
}
