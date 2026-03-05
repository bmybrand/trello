-- Enable Realtime for tables used by the dashboard
-- Run this in Supabase SQL Editor, or enable via Dashboard: Database > Replication
-- If boardcards was previously in the publication, run: ALTER PUBLICATION supabase_realtime DROP TABLE boardcards;

-- Add tables to the supabase_realtime publication (boardcards removed; cards live in cardslist by cardthemid)
ALTER PUBLICATION supabase_realtime ADD TABLE cardslist;
ALTER PUBLICATION supabase_realtime ADD TABLE itemslist;
ALTER PUBLICATION supabase_realtime ADD TABLE item_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE boards;
ALTER PUBLICATION supabase_realtime ADD TABLE board_members;
ALTER PUBLICATION supabase_realtime ADD TABLE workspace;
ALTER PUBLICATION supabase_realtime ADD TABLE board_list_order;
